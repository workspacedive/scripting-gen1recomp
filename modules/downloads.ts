import { Path, fetch } from "scripting"
import {
  DOWNLOAD_PARTIALS_ROOT,
  DOWNLOAD_STATE_BACKUP_FILE,
  DOWNLOAD_STATE_FILE,
  DOWNLOAD_STATE_TEMP_FILE,
  ensureStorage,
} from "./paths"

export type DownloadKind = "component" | "mod" | "ipa"
export type DownloadStatus = "queued" | "downloading" | "retrying" | "verifying" | "paused" | "completed" | "failed"
export type DownloadResumeSupport = "unknown" | "yes" | "no"

export type DownloadSpec = {
  id: string
  kind: DownloadKind
  title: string
  url: string
  expectedSize: number
  expectedSha256: string
  debugLabel: string
}

export type DownloadRecord = {
  id: string
  kind: DownloadKind
  title: string
  url: string
  expectedSize: number
  expectedSha256: string
  debugLabel: string
  partialFile: string
  status: DownloadStatus
  downloadedBytes: number
  totalBytes: number
  attempt: number
  resumable: DownloadResumeSupport
  etag?: string
  lastModified?: string
  error?: string
  retryAt?: string
  speedBytesPerSecond?: number
  createdAt: string
  updatedAt: string
}

type DownloadDocument = { schema: 1; records: DownloadRecord[] }
type DownloadListener = (records: DownloadRecord[]) => void
type ControlMode = "pause" | "cancel"

const MAX_RECORDS = 24
const MAX_ATTEMPTS = 6
const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024
const NETWORK_TIMEOUT_SECONDS = 300
const STATE_FLUSH_BYTES = 512 * 1024
const STATE_FLUSH_MS = 1000
const PROGRESS_NOTIFY_MS = 100

class PermanentDownloadError extends Error {}

export class DownloadControlError extends Error {
  readonly action: ControlMode

  constructor(action: ControlMode) {
    super(action === "pause" ? "Download paused. It can be resumed later." : "Download cancelled.")
    this.name = "DownloadControlError"
    this.action = action
  }
}

export function isDownloadControlError(error: unknown): error is DownloadControlError {
  return error instanceof DownloadControlError
    || (error instanceof Error && error.name === "DownloadControlError")
}

let records: DownloadRecord[] | null = null
let queueTail: Promise<void> = Promise.resolve()
const activePromises = new Map<string, Promise<Data>>()
const controllers = new Map<string, AbortController>()
const controls = new Map<string, ControlMode>()
const listeners = new Set<DownloadListener>()

function boundedText(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/.test(value) ? value : null
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 120
    && /^[A-Za-z0-9._:@+-]+$/.test(value)
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)
}

function validSize(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value > 0 && value <= MAX_DOWNLOAD_BYTES
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string") return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function safeHeader(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 512
    && !/[\r\n\u0000]/.test(value) ? value : undefined
}

function safePartialFile(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,180}\.part$/.test(value) ? value : null
}

function cloneRecord(record: DownloadRecord): DownloadRecord {
  return { ...record }
}

function partialPath(record: DownloadRecord): string {
  return Path.join(DOWNLOAD_PARTIALS_ROOT, record.partialFile)
}

function partialSize(record: DownloadRecord): number {
  const path = partialPath(record)
  if (!FileManager.existsSync(path)) return 0
  const size = Number(FileManager.statSync(path).size)
  return Number.isSafeInteger(size) && size >= 0 ? size : 0
}

function sanitizeRecord(value: unknown): DownloadRecord | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null
  const source = value as Partial<DownloadRecord>
  const title = boundedText(source.title, 240)
  const debugLabel = boundedText(source.debugLabel, 240)
  const partialFile = safePartialFile(source.partialFile)
  const createdAt = validDate(source.createdAt)
  const updatedAt = validDate(source.updatedAt)
  const statuses: DownloadStatus[] = ["queued", "downloading", "retrying", "verifying", "paused", "completed", "failed"]
  const kinds: DownloadKind[] = ["component", "mod", "ipa"]
  if (!validId(source.id) || !kinds.includes(source.kind as DownloadKind) || title == null
      || typeof source.url !== "string" || !source.url.startsWith("https://github.com/") || source.url.length > 2048
      || !validSize(source.expectedSize) || !validDigest(source.expectedSha256)
      || debugLabel == null || partialFile == null || !statuses.includes(source.status as DownloadStatus)
      || createdAt == null || updatedAt == null) return null
  const actualSize = partialSize({ partialFile } as DownloadRecord)
  if (actualSize > source.expectedSize) {
    const path = Path.join(DOWNLOAD_PARTIALS_ROOT, partialFile)
    if (FileManager.existsSync(path)) FileManager.removeSync(path)
  }
  const downloadedBytes = actualSize <= source.expectedSize ? actualSize : 0
  let status = source.status as DownloadStatus
  let error = boundedText(source.error, 1200) ?? undefined
  if (["queued", "downloading", "retrying", "verifying"].includes(status)) {
    status = "paused"
    error = downloadedBytes > 0
      ? "The previous session ended. The verified partial download can be resumed."
      : "The previous session ended before data was saved. Retry when online."
  } else if (status === "completed" && downloadedBytes !== source.expectedSize) {
    status = "failed"
    error = "The completed download file is missing or incomplete."
  }
  return {
    id: source.id,
    kind: source.kind as DownloadKind,
    title,
    url: source.url,
    expectedSize: source.expectedSize,
    expectedSha256: source.expectedSha256.toLowerCase(),
    debugLabel,
    partialFile,
    status,
    downloadedBytes,
    totalBytes: source.expectedSize,
    attempt: Number.isSafeInteger(source.attempt) ? Math.max(0, Math.min(MAX_ATTEMPTS, Number(source.attempt))) : 0,
    resumable: source.resumable === "yes" || source.resumable === "no" ? source.resumable : "unknown",
    etag: safeHeader(source.etag),
    lastModified: safeHeader(source.lastModified),
    error,
    retryAt: validDate(source.retryAt) ?? undefined,
    speedBytesPerSecond: typeof source.speedBytesPerSecond === "number" && Number.isFinite(source.speedBytesPerSecond)
      && source.speedBytesPerSecond >= 0 ? source.speedBytesPerSecond : undefined,
    createdAt,
    updatedAt,
  }
}

function writeDocument(): void {
  ensureStorage()
  const list = records ?? []
  if (FileManager.existsSync(DOWNLOAD_STATE_TEMP_FILE)) FileManager.removeSync(DOWNLOAD_STATE_TEMP_FILE)
  FileManager.writeAsStringSync(DOWNLOAD_STATE_TEMP_FILE, JSON.stringify({ schema: 1, records: list }, null, 2))
  let backedUp = false
  let installed = false
  try {
    if (FileManager.existsSync(DOWNLOAD_STATE_FILE)) {
      if (FileManager.existsSync(DOWNLOAD_STATE_BACKUP_FILE)) FileManager.removeSync(DOWNLOAD_STATE_BACKUP_FILE)
      FileManager.renameSync(DOWNLOAD_STATE_FILE, DOWNLOAD_STATE_BACKUP_FILE)
      backedUp = true
    } else {
      // A backup may be the only recoverable queue after interruption between
      // the two renames. Keep it until the new primary is fully installed.
      backedUp = FileManager.existsSync(DOWNLOAD_STATE_BACKUP_FILE)
    }
    FileManager.renameSync(DOWNLOAD_STATE_TEMP_FILE, DOWNLOAD_STATE_FILE)
    installed = true
    if (backedUp && FileManager.existsSync(DOWNLOAD_STATE_BACKUP_FILE)) {
      FileManager.removeSync(DOWNLOAD_STATE_BACKUP_FILE)
    }
  } catch (error) {
    if (installed && FileManager.existsSync(DOWNLOAD_STATE_FILE)) FileManager.removeSync(DOWNLOAD_STATE_FILE)
    if (backedUp && FileManager.existsSync(DOWNLOAD_STATE_BACKUP_FILE)) {
      FileManager.renameSync(DOWNLOAD_STATE_BACKUP_FILE, DOWNLOAD_STATE_FILE)
    }
    throw error
  } finally {
    if (FileManager.existsSync(DOWNLOAD_STATE_TEMP_FILE)) FileManager.removeSync(DOWNLOAD_STATE_TEMP_FILE)
  }
}

function loadRecordsOnce(): DownloadRecord[] {
  if (records != null) return records
  ensureStorage()
  const loaded: DownloadRecord[] = []
  for (const path of [DOWNLOAD_STATE_FILE, DOWNLOAD_STATE_BACKUP_FILE]) {
    if (!FileManager.existsSync(path)) continue
    try {
      const document = JSON.parse(FileManager.readAsStringSync(path)) as Partial<DownloadDocument>
      if (document.schema !== 1 || !Array.isArray(document.records)) continue
      const ids = new Set<string>()
      for (const value of document.records.slice(0, MAX_RECORDS)) {
        const record = sanitizeRecord(value)
        if (record != null && !ids.has(record.id)) {
          ids.add(record.id)
          loaded.push(record)
        }
      }
      break
    } catch {
      // Try the fixed backup. A queue document never authorizes bytes by
      // itself; every recovered partial still needs trusted spec + final hash.
    }
  }
  records = loaded
  writeDocument()
  return records
}

function notify(force = false): void {
  const now = Date.now()
  const list = loadRecordsOnce()
  if (!force && notify.lastAt != null && now - notify.lastAt < PROGRESS_NOTIFY_MS) return
  notify.lastAt = now
  const snapshot = list.map(cloneRecord)
  for (const listener of listeners) {
    try { listener(snapshot) } catch { /* UI observers cannot affect integrity. */ }
  }
}
notify.lastAt = undefined as number | undefined

function touch(record: DownloadRecord, status?: DownloadStatus): void {
  if (status != null) record.status = status
  record.updatedAt = new Date().toISOString()
}

function checkedSpec(spec: DownloadSpec): DownloadSpec {
  const title = boundedText(spec.title, 240)
  const debugLabel = boundedText(spec.debugLabel, 240)
  if (!validId(spec.id) || !["component", "mod", "ipa"].includes(spec.kind) || title == null
      || typeof spec.url !== "string" || !spec.url.startsWith("https://github.com/") || spec.url.length > 2048
      || !validSize(spec.expectedSize) || !validDigest(spec.expectedSha256) || debugLabel == null) {
    throw new Error("The requested download metadata is incomplete or untrusted.")
  }
  return { ...spec, title, debugLabel, expectedSha256: spec.expectedSha256.toLowerCase() }
}

function sameSpec(record: DownloadRecord, spec: DownloadSpec): boolean {
  return record.kind === spec.kind && record.title === spec.title && record.url === spec.url
    && record.expectedSize === spec.expectedSize && record.expectedSha256 === spec.expectedSha256
}

function removeRecordFiles(record: DownloadRecord): void {
  const path = partialPath(record)
  if (FileManager.existsSync(path)) FileManager.removeSync(path)
}

function recordForSpec(spec: DownloadSpec): DownloadRecord {
  const list = loadRecordsOnce()
  const existingIndex = list.findIndex(item => item.id === spec.id)
  if (existingIndex >= 0) {
    const existing = list[existingIndex]
    if (sameSpec(existing, spec)) {
      existing.downloadedBytes = partialSize(existing)
      existing.totalBytes = spec.expectedSize
      return existing
    }
    controls.set(existing.id, "cancel")
    controllers.get(existing.id)?.abort("Download metadata changed")
    removeRecordFiles(existing)
    list.splice(existingIndex, 1)
  }
  const now = new Date().toISOString()
  const safeId = spec.id.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100)
  const record: DownloadRecord = {
    ...spec,
    partialFile: `${safeId}-${spec.expectedSha256.slice(0, 16)}.part`,
    status: "queued",
    downloadedBytes: 0,
    totalBytes: spec.expectedSize,
    attempt: 0,
    resumable: "unknown",
    createdAt: now,
    updatedAt: now,
  }
  list.unshift(record)
  while (list.length > MAX_RECORDS) {
    const removed = list.pop()
    if (removed != null && !activePromises.has(removed.id)) removeRecordFiles(removed)
  }
  writeDocument()
  notify(true)
  return record
}

function responseLength(response: any): number | null {
  const header = Number(response.headers?.get?.("content-length"))
  if (Number.isSafeInteger(header) && header >= 0) return header
  const expected = Number(response.expectedContentLength)
  return Number.isSafeInteger(expected) && expected >= 0 ? expected : null
}

function parseContentRange(value: string | null): { start: number; end: number; total: number } | null {
  const match = value?.match(/^bytes (\d+)-(\d+)\/(\d+)$/i)
  if (match == null) return null
  const start = Number(match[1])
  const end = Number(match[2])
  const total = Number(match[3])
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && Number.isSafeInteger(total)
    && start >= 0 && end >= start && total > end ? { start, end, total } : null
}

function retryAfterMilliseconds(response: any): number | null {
  const raw = response.headers?.get?.("retry-after")
  if (typeof raw !== "string") return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60_000, Math.floor(seconds * 1000))
  const date = new Date(raw).getTime()
  return Number.isFinite(date) ? Math.max(0, Math.min(60_000, date - Date.now())) : null
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599)
}

function controlFor(id: string): ControlMode | null {
  return controls.get(id) ?? null
}

function throwIfControlled(id: string): void {
  const mode = controlFor(id)
  if (mode != null) throw new DownloadControlError(mode)
}

async function controlledDelay(record: DownloadRecord, milliseconds: number): Promise<void> {
  const until = Date.now() + milliseconds
  while (Date.now() < until) {
    throwIfControlled(record.id)
    await new Promise<void>(resolve => setTimeout(resolve, Math.min(250, until - Date.now())))
  }
}

function appendChunk(record: DownloadRecord, chunk: Data): void {
  if (chunk.size <= 0) return
  const next = record.downloadedBytes + chunk.size
  if (next > record.expectedSize || next > MAX_DOWNLOAD_BYTES) {
    throw new PermanentDownloadError("The server sent more bytes than the verified release metadata allows.")
  }
  FileManager.appendDataSync(partialPath(record), chunk)
  record.downloadedBytes = next
  touch(record, "downloading")
}

async function streamResponse(record: DownloadRecord, response: any): Promise<void> {
  let lastStateBytes = record.downloadedBytes
  let lastStateAt = Date.now()
  let lastNotifyAt = 0
  const speedStartBytes = record.downloadedBytes
  const speedStartAt = Date.now()
  const updateProgress = (force = false) => {
    const now = Date.now()
    const elapsed = Math.max(1, now - speedStartAt)
    record.speedBytesPerSecond = Math.max(0, (record.downloadedBytes - speedStartBytes) * 1000 / elapsed)
    if (force || record.downloadedBytes - lastStateBytes >= STATE_FLUSH_BYTES || now - lastStateAt >= STATE_FLUSH_MS) {
      writeDocument()
      lastStateBytes = record.downloadedBytes
      lastStateAt = now
    }
    if (force || now - lastNotifyAt >= PROGRESS_NOTIFY_MS) {
      notify(force)
      lastNotifyAt = now
    }
  }

  let stream: any = null
  try { stream = response.dataStream } catch { stream = null }
  if (stream != null && typeof stream.getReader === "function") {
    const reader = stream.getReader()
    try {
      while (true) {
        throwIfControlled(record.id)
        const result = await reader.read()
        if (result?.done) break
        const chunk = result?.value as Data | null | undefined
        if (chunk == null || typeof chunk.size !== "number") {
          throw new Error("The network stream returned an invalid binary chunk.")
        }
        appendChunk(record, chunk)
        updateProgress()
      }
    } finally {
      try { reader.releaseLock?.() } catch { /* no-op */ }
    }
  } else {
    // Compatibility fallback for an older Scripting runtime without dataStream.
    // It remains retryable and resumable between requests, but progress can only
    // advance once the native fetch has produced the bounded response body.
    const chunk = await response.data()
    if (chunk == null || typeof chunk.size !== "number") throw new Error("The response body was not binary data.")
    throwIfControlled(record.id)
    appendChunk(record, chunk)
  }
  updateProgress(true)
}

function verifyPartial(record: DownloadRecord): Data {
  record.downloadedBytes = partialSize(record)
  if (record.downloadedBytes !== record.expectedSize) {
    throw new Error(`The download is incomplete (${record.downloadedBytes}/${record.expectedSize} bytes).`)
  }
  const data = Data.fromFile(partialPath(record))
  if (data == null || data.size !== record.expectedSize) throw new Error("The completed download could not be read.")
  const actual = Crypto.sha256(data).toHexString().toLowerCase()
  if (actual !== record.expectedSha256) {
    removeRecordFiles(record)
    record.downloadedBytes = 0
    throw new PermanentDownloadError("The downloaded file failed its published SHA-256 integrity check and was discarded.")
  }
  return data
}

async function oneAttempt(record: DownloadRecord): Promise<void> {
  throwIfControlled(record.id)
  let offset = partialSize(record)
  if (offset > record.expectedSize) {
    removeRecordFiles(record)
    offset = 0
  }
  record.downloadedBytes = offset
  if (offset === record.expectedSize) return

  const headers: Record<string, string> = { "Accept-Encoding": "identity" }
  if (offset > 0) {
    headers.Range = `bytes=${offset}-`
    const validator = record.etag ?? record.lastModified
    if (validator != null) headers["If-Range"] = validator
  }
  const controller = new AbortController()
  controllers.set(record.id, controller)
  let response: any
  try {
    response = await fetch(record.url, {
      headers,
      timeout: NETWORK_TIMEOUT_SECONDS,
      signal: controller.signal,
      debugLabel: record.debugLabel,
    })
  } finally {
    controllers.delete(record.id)
  }
  throwIfControlled(record.id)

  if (response.status === 416 && offset > 0) {
    const match = response.headers?.get?.("content-range")?.match(/^bytes \*\/(\d+)$/i)
    const total = match == null ? null : Number(match[1])
    if (total === record.expectedSize && offset === total) return
    removeRecordFiles(record)
    record.downloadedBytes = 0
    throw new Error("The server rejected the saved range; restarting from verified byte zero.")
  }
  if (!response.ok || (response.status !== 200 && response.status !== 206)) {
    const error = new Error(`Download failed with HTTP ${response.status}.`)
    ;(error as Error & { retryAfter?: number; retryable?: boolean }).retryAfter = retryAfterMilliseconds(response) ?? undefined
    ;(error as Error & { retryAfter?: number; retryable?: boolean }).retryable = retryableStatus(Number(response.status))
    throw error
  }

  if (offset > 0 && response.status === 200) {
    // Range was ignored (or If-Range detected a changed object). Never append a
    // full 200 response to a partial file: restart cleanly and verify the hash.
    removeRecordFiles(record)
    offset = 0
    record.downloadedBytes = 0
    record.resumable = "no"
    record.etag = undefined
    record.lastModified = undefined
  } else if (response.status === 206) {
    const range = parseContentRange(response.headers?.get?.("content-range") ?? null)
    if (range == null || range.start !== offset || range.total !== record.expectedSize) {
      removeRecordFiles(record)
      record.downloadedBytes = 0
      throw new Error("The server returned an invalid Content-Range; restarting safely.")
    }
    record.resumable = "yes"
  }

  const length = responseLength(response)
  const expectedBody = record.expectedSize - offset
  if (length != null && length !== expectedBody) {
    throw new PermanentDownloadError(`The server response length (${length}) does not match verified metadata (${expectedBody}).`)
  }
  record.etag = safeHeader(response.headers?.get?.("etag"))
  record.lastModified = safeHeader(response.headers?.get?.("last-modified"))
  touch(record, "downloading")
  writeDocument()
  notify(true)
  controllers.set(record.id, controller)
  try {
    await streamResponse(record, response)
  } finally {
    controllers.delete(record.id)
  }
}

async function runDownload(record: DownloadRecord): Promise<Data> {
  if (record.status === "completed") {
    touch(record, "verifying")
    notify(true)
    try {
      const data = verifyPartial(record)
      touch(record, "completed")
      writeDocument()
      notify(true)
      return data
    } catch {
      record.status = "failed"
      record.error = "The saved completed file no longer passes verification."
    }
  }

  let lastError: unknown = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    record.attempt = attempt
    record.error = undefined
    record.retryAt = undefined
    touch(record, "downloading")
    writeDocument()
    notify(true)
    try {
      await oneAttempt(record)
      throwIfControlled(record.id)
      touch(record, "verifying")
      record.speedBytesPerSecond = undefined
      writeDocument()
      notify(true)
      const data = verifyPartial(record)
      touch(record, "completed")
      record.error = undefined
      record.retryAt = undefined
      writeDocument()
      notify(true)
      return data
    } catch (error) {
      const mode = controlFor(record.id)
      if (mode != null || isDownloadControlError(error)) {
        const action = mode ?? (error as DownloadControlError).action
        if (action === "cancel") {
          removeRecordFiles(record)
          const list = loadRecordsOnce()
          const index = list.indexOf(record)
          if (index >= 0) list.splice(index, 1)
        } else {
          record.downloadedBytes = partialSize(record)
          record.speedBytesPerSecond = undefined
          record.error = "Paused. Saved bytes will be range-validated when resumed."
          touch(record, "paused")
        }
        controls.delete(record.id)
        writeDocument()
        notify(true)
        throw new DownloadControlError(action)
      }
      lastError = error
      record.downloadedBytes = partialSize(record)
      const retryable = !(error instanceof PermanentDownloadError)
        && ((error as { retryable?: unknown })?.retryable !== false)
      if (!retryable || attempt >= MAX_ATTEMPTS) break
      const declared = Number((error as { retryAfter?: unknown })?.retryAfter)
      const delay = Number.isFinite(declared) && declared >= 0
        ? Math.min(60_000, declared)
        : Math.min(16_000, 1000 * 2 ** (attempt - 1))
      record.error = error instanceof Error ? error.message : String(error)
      record.retryAt = new Date(Date.now() + delay).toISOString()
      record.speedBytesPerSecond = undefined
      touch(record, "retrying")
      writeDocument()
      notify(true)
      await controlledDelay(record, delay)
    }
  }

  record.downloadedBytes = partialSize(record)
  record.speedBytesPerSecond = undefined
  record.retryAt = undefined
  record.error = lastError instanceof Error ? lastError.message : String(lastError ?? "Download failed.")
  touch(record, "failed")
  writeDocument()
  notify(true)
  throw lastError instanceof Error ? lastError : new Error(record.error)
}

export function loadDownloadRecords(): DownloadRecord[] {
  return loadRecordsOnce().map(cloneRecord)
}

export function subscribeDownloads(listener: DownloadListener): () => void {
  listeners.add(listener)
  listener(loadDownloadRecords())
  return () => listeners.delete(listener)
}

export function downloadProgress(record: DownloadRecord): number {
  return record.totalBytes > 0 ? Math.max(0, Math.min(1, record.downloadedBytes / record.totalBytes)) : 0
}

export async function downloadVerifiedData(specValue: DownloadSpec): Promise<Data> {
  const spec = checkedSpec(specValue)
  const joined = activePromises.get(spec.id)
  if (joined != null) {
    const active = loadRecordsOnce().find(item => item.id === spec.id)
    if (active == null || !sameSpec(active, spec)) throw new Error("A different trusted asset is already using this download id.")
    return joined
  }
  const record = recordForSpec(spec)
  touch(record, "queued")
  record.error = undefined
  writeDocument()
  notify(true)

  let resolveResult!: (data: Data) => void
  let rejectResult!: (error: unknown) => void
  const promise = new Promise<Data>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  activePromises.set(spec.id, promise)
  const queued = queueTail.catch(() => undefined).then(async () => {
    try {
      resolveResult(await runDownload(record))
    } catch (error) {
      rejectResult(error)
    } finally {
      controls.delete(spec.id)
      activePromises.delete(spec.id)
    }
  })
  queueTail = queued
  return promise
}

export function pauseDownload(id: string): void {
  const record = loadRecordsOnce().find(item => item.id === id)
  if (record == null || !["queued", "downloading", "retrying"].includes(record.status)) return
  controls.set(id, "pause")
  controllers.get(id)?.abort("Paused by user")
  record.error = "Pausing after the current native network operation…"
  touch(record, "paused")
  writeDocument()
  notify(true)
}

export function cancelDownload(id: string): void {
  const record = loadRecordsOnce().find(item => item.id === id)
  if (record == null) return
  if (activePromises.has(id)) controls.set(id, "cancel")
  else controls.delete(id)
  controllers.get(id)?.abort("Cancelled by user")
  removeRecordFiles(record)
  const list = loadRecordsOnce()
  const index = list.indexOf(record)
  if (index >= 0) list.splice(index, 1)
  writeDocument()
  notify(true)
}

export async function resumeDownload(id: string): Promise<void> {
  const record = loadRecordsOnce().find(item => item.id === id)
  if (record == null) throw new Error("The saved download is no longer available.")
  controls.delete(id)
  await downloadVerifiedData({
    id: record.id,
    kind: record.kind,
    title: record.title,
    url: record.url,
    expectedSize: record.expectedSize,
    expectedSha256: record.expectedSha256,
    debugLabel: record.debugLabel,
  })
}

export function discardDownload(id: string): void {
  if (activePromises.has(id)) {
    cancelDownload(id)
    return
  }
  const list = loadRecordsOnce()
  const index = list.findIndex(item => item.id === id)
  if (index < 0) return
  removeRecordFiles(list[index])
  list.splice(index, 1)
  writeDocument()
  notify(true)
}
