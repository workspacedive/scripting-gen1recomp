import { Path } from "scripting"
import {
  DIAGNOSTIC_LOG_FILE,
  DIAGNOSTIC_PREVIOUS_LOG_FILE,
  ensureStorage,
} from "./paths"

export type DiagnosticLevel = "debug" | "info" | "warning" | "error" | "fatal"
export type DiagnosticExportFormat = "txt" | "json" | "jsonl" | "csv"

export type DiagnosticEntry = {
  schema: 1
  recordedAt: string
  occurredAt: string
  sessionId: string
  sequence: number
  origin: "native" | "web"
  source: string
  level: DiagnosticLevel
  event: string
  message: string
  part?: number
  parts?: number
  elapsedMs?: number
  details?: string
}

export type DiagnosticSummary = {
  bytes: number
  entries: number
  sessions: number
  errors: number
  lastEntryAt?: string
  lastErrorAt?: string
  lastErrorMessage?: string
}

type WebDiagnosticMessage = {
  sequence?: unknown
  occurredAt?: unknown
  elapsedMs?: unknown
  source?: unknown
  level?: unknown
  event?: unknown
  message?: unknown
  part?: unknown
  parts?: unknown
}

type WebDiagnosticBatch = {
  schema?: unknown
  entries?: unknown
}

const ROTATE_BEFORE_SESSION_BYTES = 8 * 1024 * 1024
const MAX_WEB_CHUNK_CHARACTERS = 16 * 1024
const MAX_WEB_BATCH_ENTRIES = 128
const DIAGNOSTIC_BATCH_CHARACTERS = 64 * 1024
const DIAGNOSTIC_BATCH_DELAY_MS = 75
const levels: DiagnosticLevel[] = ["debug", "info", "warning", "error", "fatal"]
const nativeSequences = new Map<string, number>()
const pendingLines: string[] = []
let pendingCharacters = 0
let flushTimer: ReturnType<typeof setTimeout> | null = null
let operationChain: Promise<void> = Promise.resolve()

function fileSize(path: string): number {
  try {
    if (!FileManager.existsSync(path)) return 0
    const value = Number(FileManager.statSync(path).size)
    return Number.isSafeInteger(value) && value >= 0 ? value : 0
  } catch {
    return 0
  }
}

function rotateBeforeSession(): void {
  try {
    ensureStorage()
    const activeBytes = fileSize(DIAGNOSTIC_LOG_FILE)
    if (activeBytes < ROTATE_BEFORE_SESSION_BYTES) {
      if (activeBytes > 0) {
        const tail = FileManager.readAsStringSync(DIAGNOSTIC_LOG_FILE)
        if (!tail.endsWith("\n")) FileManager.appendTextSync(DIAGNOSTIC_LOG_FILE, "\n")
      }
      return
    }
    if (FileManager.existsSync(DIAGNOSTIC_PREVIOUS_LOG_FILE)) FileManager.removeSync(DIAGNOSTIC_PREVIOUS_LOG_FILE)
    FileManager.renameSync(DIAGNOSTIC_LOG_FILE, DIAGNOSTIC_PREVIOUS_LOG_FILE)
  } catch (error) {
    console.warn("Diagnostic log rotation failed; the active log was preserved:", error)
  }
}

function safeJson(value: unknown): string {
  const seen = new WeakSet<object>()
  try {
    const text = JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === "bigint") return `${item.toString()}n`
      if (item instanceof Error) {
        return {
          name: item.name,
          message: item.message,
          stack: item.stack ?? null,
          cause: "cause" in item ? (item as Error & { cause?: unknown }).cause ?? null : null,
        }
      }
      if (item != null && typeof item === "object") {
        if (seen.has(item)) return "[Circular]"
        seen.add(item)
      }
      return item
    })
    return text ?? String(value)
  } catch {
    try { return String(value) } catch { return "[Unprintable value]" }
  }
}

function queueOperation(operation: () => void | Promise<void>): Promise<void> {
  // A rejected write must not reorder later batches. The individual caller
  // still receives its rejection, while the next operation starts only after
  // the failed operation has fully settled.
  operationChain = operationChain.catch(() => undefined).then(operation)
  return operationChain
}

function queuePendingBatch(): Promise<void> {
  if (flushTimer != null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (pendingLines.length === 0) return operationChain
  const text = pendingLines.join("")
  pendingLines.length = 0
  pendingCharacters = 0
  return queueOperation(async () => {
    ensureStorage()
    try {
      // Official Scripting documentation recommends the asynchronous form.
      // One ordered append now carries many intact JSONL records instead of
      // blocking the message-handler path once for every Web console line.
      await FileManager.appendText(DIAGNOSTIC_LOG_FILE, text)
    } catch (asynchronousError) {
      try {
        // The fallback is one append for the complete batch, never a return to
        // per-record synchronous persistence. It preserves terminal evidence
        // if an installed host build rejects the documented async operation.
        FileManager.appendTextSync(DIAGNOSTIC_LOG_FILE, text)
      } catch (synchronousError) {
        console.error("Could not persist Gen1Recomp diagnostic batch:", asynchronousError, synchronousError)
        throw synchronousError
      }
    }
  })
}

function schedulePendingBatch(): void {
  if (flushTimer != null) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void queuePendingBatch().catch(error => {
      // Diagnostics must never prevent the player or dashboard from opening.
      console.error("Could not persist Gen1Recomp diagnostics:", error)
    })
  }, DIAGNOSTIC_BATCH_DELAY_MS)
}

function appendEntry(entry: DiagnosticEntry): void {
  try {
    const line = `${JSON.stringify(entry)}\n`
    pendingLines.push(line)
    pendingCharacters += line.length
    if (pendingCharacters >= DIAGNOSTIC_BATCH_CHARACTERS) {
      void queuePendingBatch().catch(error => {
        console.error("Could not persist Gen1Recomp diagnostics:", error)
      })
    } else {
      schedulePendingBatch()
    }
  } catch (error) {
    console.error("Could not queue Gen1Recomp diagnostics:", error)
  }
}

export function flushDiagnostics(): Promise<void> {
  return queuePendingBatch()
}

function nativeSequence(sessionId: string): number {
  const next = (nativeSequences.get(sessionId) ?? 0) + 1
  nativeSequences.set(sessionId, next)
  return next
}

function validDate(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function token(value: unknown, fallback: string, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum
      || !/^[A-Za-z0-9_.:-]+$/.test(value)) return fallback
  return value
}

export function beginDiagnosticSession(kind: string, details?: unknown): string {
  // Preserve ordering across overlapping dashboard/game sessions: all pending
  // records are queued first, rotation runs after those writes, and this
  // session's first batch is queued behind the rotation operation.
  queuePendingBatch()
  void queueOperation(() => rotateBeforeSession()).catch(error => {
    console.warn("Diagnostic session rotation operation failed:", error)
  })
  let id: string
  try {
    id = Crypto.generateSymmetricKey(128).toHexString().toLowerCase()
  } catch {
    id = `fallback-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`
  }
  nativeSequences.set(id, 0)
  recordDiagnostic(id, "suite", "info", "session_start", kind, details)
  return id
}

export function recordDiagnostic(
  sessionId: string,
  source: string,
  level: DiagnosticLevel,
  event: string,
  message: string,
  details?: unknown,
): void {
  const now = new Date().toISOString()
  appendEntry({
    schema: 1,
    recordedAt: now,
    occurredAt: now,
    sessionId,
    sequence: nativeSequence(sessionId),
    origin: "native",
    source: token(source, "suite", 64),
    level: levels.includes(level) ? level : "info",
    event: token(event, "event", 96),
    message,
    ...(details == null ? {} : { details: safeJson(details) }),
  })
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
      cause: "cause" in error ? (error as Error & { cause?: unknown }).cause ?? null : null,
    }
  }
  return { value: safeJson(error) }
}

export function recordDiagnosticError(
  sessionId: string,
  source: string,
  event: string,
  error: unknown,
  details?: unknown,
): void {
  const description = errorDetails(error)
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  recordDiagnostic(sessionId, source, "error", event, message, {
    error: description,
    context: details ?? null,
  })
}

export async function endDiagnosticSession(sessionId: string, outcome: string, details?: unknown): Promise<void> {
  recordDiagnostic(sessionId, "suite", "info", "session_end", outcome, details)
  nativeSequences.delete(sessionId)
  // Session completion is a durability boundary: cleanup/terminal paths do
  // not return until every earlier native and Web record has been appended.
  await flushDiagnostics()
}

export function acceptWebDiagnostic(sessionId: string, value?: WebDiagnosticMessage): { ok: boolean } {
  const now = new Date().toISOString()
  if (value == null || typeof value !== "object"
      || typeof value.sequence !== "number" || !Number.isSafeInteger(value.sequence) || value.sequence < 0
      || value.sequence > 1_000_000_000
      || typeof value.message !== "string" || value.message.length > MAX_WEB_CHUNK_CHARACTERS
      || typeof value.level !== "string" || !levels.includes(value.level as DiagnosticLevel)
      || (value.elapsedMs != null && (typeof value.elapsedMs !== "number" || !Number.isFinite(value.elapsedMs)
        || value.elapsedMs < 0 || value.elapsedMs > 7 * 24 * 60 * 60 * 1000))) {
    recordDiagnostic(sessionId, "diagnostics", "warning", "web_message_rejected", "A malformed Web diagnostic message was rejected.", {
      receivedType: value == null ? String(value) : typeof value,
      messageCharacters: typeof value?.message === "string" ? value.message.length : null,
    })
    return { ok: false }
  }
  const parts = Number(value.parts)
  const part = Number(value.part)
  const chunkFieldsAbsent = value.parts == null && value.part == null
  const hasParts = typeof value.parts === "number" && Number.isSafeInteger(parts) && parts > 1 && parts <= 100_000
    && typeof value.part === "number" && Number.isSafeInteger(part) && part >= 1 && part <= parts
  if (!chunkFieldsAbsent && !hasParts) {
    recordDiagnostic(sessionId, "diagnostics", "warning", "web_chunk_rejected", "Invalid Web diagnostic chunk metadata was rejected.", {
      part: value.part,
      parts: value.parts,
      sequence: value.sequence,
    })
    return { ok: false }
  }
  const elapsed = Number(value.elapsedMs)
  appendEntry({
    schema: 1,
    recordedAt: now,
    occurredAt: validDate(value.occurredAt, now),
    sessionId,
    sequence: Number(value.sequence),
    origin: "web",
    source: token(value.source, "web", 64),
    level: value.level as DiagnosticLevel,
    event: token(value.event, "console", 96),
    message: value.message,
    ...(hasParts ? { part, parts } : {}),
    ...(Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 7 * 24 * 60 * 60 * 1000 ? { elapsedMs: elapsed } : {}),
  })
  return { ok: true }
}

export function acceptWebDiagnosticEnvelope(
  sessionId: string,
  value?: unknown,
): { ok: boolean; accepted: number; rejected: number } {
  if (value != null && typeof value === "object" && "entries" in value) {
    const batch = value as WebDiagnosticBatch
    if (batch.schema !== 1 || !Array.isArray(batch.entries)
        || batch.entries.length === 0 || batch.entries.length > MAX_WEB_BATCH_ENTRIES) {
      recordDiagnostic(sessionId, "diagnostics", "warning", "web_batch_rejected",
        "A malformed or oversized Web diagnostic batch was rejected.", {
          schema: batch.schema,
          entries: Array.isArray(batch.entries) ? batch.entries.length : null,
          maximumEntries: MAX_WEB_BATCH_ENTRIES,
        })
      return { ok: false, accepted: 0, rejected: 1 }
    }
    let accepted = 0
    let rejected = 0
    for (const entry of batch.entries) {
      const result = acceptWebDiagnostic(
        sessionId,
        entry != null && typeof entry === "object" ? entry as WebDiagnosticMessage : undefined,
      )
      if (result.ok) accepted += 1
      else rejected += 1
    }
    return { ok: rejected === 0, accepted, rejected }
  }
  const result = acceptWebDiagnostic(sessionId, value as WebDiagnosticMessage | undefined)
  return { ok: result.ok, accepted: result.ok ? 1 : 0, rejected: result.ok ? 0 : 1 }
}

function allRawLogs(): string {
  const pieces: string[] = []
  for (const path of [DIAGNOSTIC_PREVIOUS_LOG_FILE, DIAGNOSTIC_LOG_FILE]) {
    try {
      if (!FileManager.existsSync(path)) continue
      const text = FileManager.readAsStringSync(path)
      if (text.length > 0) pieces.push(text.endsWith("\n") ? text : `${text}\n`)
    } catch (error) {
      const now = new Date().toISOString()
      pieces.push(`${JSON.stringify({
        schema: 1,
        recordedAt: now,
        occurredAt: now,
        sessionId: "diagnostic-reader",
        sequence: 0,
        origin: "native",
        source: "diagnostics",
        level: "error",
        event: "log_read_failed",
        message: String(error),
      })}\n`)
    }
  }
  return pieces.join("")
}

function validStoredEntry(value: unknown): value is DiagnosticEntry {
  if (value == null || typeof value !== "object") return false
  const entry = value as Partial<DiagnosticEntry>
  const noParts = entry.part === undefined && entry.parts === undefined
  const validParts = typeof entry.part === "number" && Number.isSafeInteger(entry.part) && entry.part >= 1
    && typeof entry.parts === "number" && Number.isSafeInteger(entry.parts) && entry.parts > 1 && entry.parts <= 100_000
    && entry.part <= entry.parts
  return entry.schema === 1
    && typeof entry.recordedAt === "string" && typeof entry.occurredAt === "string"
    && typeof entry.sessionId === "string" && entry.sessionId.length > 0
    && typeof entry.sequence === "number" && Number.isSafeInteger(entry.sequence) && entry.sequence >= 0
    && (entry.origin === "native" || entry.origin === "web")
    && typeof entry.source === "string" && typeof entry.event === "string"
    && typeof entry.level === "string" && levels.includes(entry.level as DiagnosticLevel)
    && typeof entry.message === "string"
    && (noParts || validParts)
    && (entry.elapsedMs === undefined || (typeof entry.elapsedMs === "number" && Number.isFinite(entry.elapsedMs)
      && entry.elapsedMs >= 0 && entry.elapsedMs <= 7 * 24 * 60 * 60 * 1000))
    && (entry.details === undefined || typeof entry.details === "string")
}

export function loadDiagnosticEntries(): DiagnosticEntry[] {
  const entries: DiagnosticEntry[] = []
  const raw = allRawLogs()
  const lines = raw.split("\n")
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === "") continue
    try {
      const value: unknown = JSON.parse(line)
      if (!validStoredEntry(value)) throw new Error("Invalid entry schema")
      entries.push(value)
    } catch (error) {
      const now = new Date().toISOString()
      entries.push({
        schema: 1,
        recordedAt: now,
        occurredAt: now,
        sessionId: "diagnostic-reader",
        sequence: index,
        origin: "native",
        source: "diagnostics",
        level: "error",
        event: "malformed_jsonl_entry",
        message: line,
        details: safeJson(errorDetails(error)),
      })
    }
  }
  return entries
}

export function diagnosticSummary(): DiagnosticSummary {
  const entries = loadDiagnosticEntries()
  const sessions = new Set(entries.map(entry => entry.sessionId))
  const errors = entries.filter(entry => (entry.level === "error" || entry.level === "fatal")
    && (entry.parts == null || entry.part === 1))
  const last = entries[entries.length - 1]
  const lastError = errors[errors.length - 1]
  let lastErrorMessage = lastError?.message
  if (lastError?.parts != null) {
    lastErrorMessage = entries
      .filter(entry => entry.sessionId === lastError.sessionId && entry.origin === lastError.origin
        && entry.sequence === lastError.sequence && entry.source === lastError.source
        && entry.event === lastError.event && entry.parts === lastError.parts)
      .sort((left, right) => Number(left.part) - Number(right.part))
      .map(entry => entry.message)
      .join("")
  }
  return {
    bytes: fileSize(DIAGNOSTIC_PREVIOUS_LOG_FILE) + fileSize(DIAGNOSTIC_LOG_FILE),
    entries: entries.length,
    sessions: sessions.size,
    errors: errors.length,
    ...(last == null ? {} : { lastEntryAt: last.recordedAt }),
    ...(lastError == null ? {} : {
      lastErrorAt: lastError.occurredAt,
      lastErrorMessage: lastErrorMessage ?? lastError.message,
    }),
  }
}

function csv(value: unknown): string {
  const text = value == null ? "" : String(value)
  const spreadsheetSafe = /^[\u0000-\u0020]*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${spreadsheetSafe.replace(/"/g, '""')}"`
}

function textExport(metadata: unknown, entries: DiagnosticEntry[]): string {
  const lines = [
    "Gen1Recomp Native Suite — complete persistent console diagnostics",
    `Generated: ${new Date().toISOString()}`,
    "Messages are not sampled or shortened; oversized Web messages are preserved as numbered parts.",
    "",
    "CONTEXT",
    safeJson(metadata),
    "",
    "EVENTS",
  ]
  for (const entry of entries) {
    const part = entry.parts == null ? "" : ` part=${entry.part}/${entry.parts}`
    const elapsed = entry.elapsedMs == null ? "" : ` +${entry.elapsedMs.toFixed(3)}ms`
    lines.push(`[${entry.occurredAt}] [${entry.sessionId}] [${entry.origin}:${entry.sequence}${part}${elapsed}] [${entry.level.toUpperCase()}] [${entry.source}:${entry.event}]`)
    lines.push(entry.message)
    if (entry.details != null) lines.push(`details=${entry.details}`)
    lines.push("")
  }
  return `${lines.join("\n")}\n`
}

export async function createDiagnosticExport(format: DiagnosticExportFormat, metadata: unknown): Promise<string> {
  // Export is an explicit durability boundary: include every record accepted
  // before the user requested the file, including a partially filled batch.
  await flushDiagnostics()
  const entries = loadDiagnosticEntries()
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const path = Path.join(FileManager.temporaryDirectory, `Gen1Recomp-Console-${stamp}.${format}`)
  let output: string
  if (format === "jsonl") {
    output = allRawLogs()
  } else if (format === "json") {
    output = `${JSON.stringify({
      schema: 2,
      generatedAt: new Date().toISOString(),
      note: "Complete persistent console diagnostics; chunked entries reconstruct oversized messages without omission.",
      metadata,
      summary: diagnosticSummary(),
      entries,
    }, null, 2)}\n`
  } else if (format === "csv") {
    const rows = [["recordedAt", "occurredAt", "sessionId", "sequence", "origin", "source", "level", "event", "part", "parts", "elapsedMs", "message", "details"].map(csv).join(",")]
    for (const entry of entries) {
      rows.push([
        entry.recordedAt, entry.occurredAt, entry.sessionId, entry.sequence, entry.origin,
        entry.source, entry.level, entry.event, entry.part, entry.parts, entry.elapsedMs,
        entry.message, entry.details,
      ].map(csv).join(","))
    }
    output = `${rows.join("\r\n")}\r\n`
  } else {
    output = textExport(metadata, entries)
  }
  FileManager.writeAsStringSync(path, output)
  return path
}

export async function clearDiagnostics(): Promise<void> {
  await flushDiagnostics()
  await queueOperation(() => {
    pendingLines.length = 0
    pendingCharacters = 0
    for (const path of [DIAGNOSTIC_LOG_FILE, DIAGNOSTIC_PREVIOUS_LOG_FILE]) {
      if (FileManager.existsSync(path)) FileManager.removeSync(path)
    }
  })
}
