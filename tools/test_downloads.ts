import { createHash } from "node:crypto"
import {
  TestData,
  __testFiles,
} from "./scripting-node-stub"
import {
  cancelDownload,
  discardDownload,
  downloadVerifiedData,
  isDownloadControlError,
  loadDownloadRecords,
  pauseDownload,
  resumeDownload,
  subscribeDownloads,
} from "../modules/downloads"
import {
  DOWNLOAD_PARTIALS_ROOT,
  DOWNLOAD_STATE_BACKUP_FILE,
  DOWNLOAD_STATE_FILE,
  DOWNLOAD_STATE_TEMP_FILE,
} from "../modules/paths"

type FetchOptions = { headers?: Record<string, string>; signal?: AbortSignal }
type ReaderStep = TestData | Error

const encoder = new TextEncoder()

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function partialPath(partialFile: string): string {
  return `${DOWNLOAD_PARTIALS_ROOT}/${partialFile}`
}

function response(status: number, headers: Record<string, string>, steps: ReaderStep[]) {
  let index = 0
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    expectedContentLength: Number(headers["content-length"]),
    dataStream: {
      getReader: () => ({
        read: async () => {
          const step = steps[index++]
          if (step == null) return { done: true }
          if (step instanceof Error) throw step
          return { done: false, value: step }
        },
        releaseLock: () => undefined,
      }),
    },
  }
}

async function rejected(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
    throw new Error("Expected the download to reject")
  } catch (error) {
    if (error instanceof Error && error.message === "Expected the download to reject") throw error
    return error
  }
}

function clearAll(): void {
  for (const key of [...__testFiles.keys()]) __testFiles.delete(key)
  for (const record of loadDownloadRecords()) discardDownload(record.id)
  for (const key of [...__testFiles.keys()]) {
    if (key !== DOWNLOAD_STATE_FILE) __testFiles.delete(key)
  }
}

function spec(id: string, kind: "component" | "mod" | "ipa", title: string, file: string, bytes: Uint8Array) {
  return {
    id,
    kind,
    title,
    url: `https://github.com/example/project/releases/download/v1/${file}`,
    expectedSize: bytes.length,
    expectedSha256: digest(bytes),
    debugLabel: title,
  }
}

/** Must be first: it exercises a fresh module's one-time startup reconciliation. */
async function processReloadAndBackupRecoveryTest(): Promise<void> {
  const complete = encoder.encode("abcdef")
  const saved = complete.slice(0, 3)
  const now = new Date().toISOString()
  const partialFile = `mod_reload-${digest(complete).slice(0, 16)}.part`
  const recoveryRecord = {
    ...spec("mod:reload", "mod", "Reload fixture", "reload.zip", complete),
    partialFile,
    status: "downloading",
    downloadedBytes: saved.length,
    totalBytes: complete.length,
    attempt: 2,
    resumable: "yes",
    etag: '"reload-v1"',
    createdAt: now,
    updatedAt: now,
  }
  __testFiles.set(partialPath(partialFile), saved)
  __testFiles.set(DOWNLOAD_STATE_FILE, encoder.encode("{broken primary"))
  __testFiles.set(DOWNLOAD_STATE_BACKUP_FILE, encoder.encode(JSON.stringify({ schema: 1, records: [recoveryRecord] })))

  const loaded = loadDownloadRecords()
  const recovered = loaded.find(item => item.id === "mod:reload")
  assert(recovered?.status === "paused" && recovered.downloadedBytes === saved.length,
    "Process-reload reconciliation did not pause and retain the saved partial")
  assert(recovered.error?.includes("previous session ended"),
    "Process-reload reconciliation did not explain the interrupted session")
  assert(__testFiles.has(DOWNLOAD_STATE_FILE), "Backup recovery did not install a repaired primary queue")
  assert(!__testFiles.has(DOWNLOAD_STATE_BACKUP_FILE) && !__testFiles.has(DOWNLOAD_STATE_TEMP_FILE),
    "Backup recovery left transaction debris after installing the repaired primary")
  const repaired = JSON.parse(new TextDecoder().decode(__testFiles.get(DOWNLOAD_STATE_FILE)))
  assert(repaired.records?.[0]?.id === "mod:reload" && repaired.records?.[0]?.status === "paused",
    "Recovered queue state was not rewritten transactionally")
  discardDownload("mod:reload")
}

async function transactionRollbackTest(): Promise<void> {
  const before = new TextDecoder().decode(__testFiles.get(DOWNLOAD_STATE_FILE))
  const bytes = encoder.encode("transaction")
  const manager = (globalThis as any).FileManager
  const rename = manager.renameSync
  let injected = false
  manager.renameSync = (source: string, destination: string) => {
    if (!injected && source === DOWNLOAD_STATE_TEMP_FILE && destination === DOWNLOAD_STATE_FILE) {
      injected = true
      throw new Error("simulated interruption while installing primary queue")
    }
    return rename(source, destination)
  }
  let error: unknown
  try {
    error = await rejected(downloadVerifiedData(spec(
      "component:transaction-rollback", "component", "Transaction rollback fixture", "transaction.love", bytes,
    )))
  } finally {
    manager.renameSync = rename
  }
  assert(error instanceof Error && injected, "Transaction interruption fixture did not reach the primary install rename")
  const after = new TextDecoder().decode(__testFiles.get(DOWNLOAD_STATE_FILE))
  assert(after === before, "A failed queue commit did not restore the previous primary document")
  assert(!__testFiles.has(DOWNLOAD_STATE_BACKUP_FILE) && !__testFiles.has(DOWNLOAD_STATE_TEMP_FILE),
    "Failed queue commit left backup/temp transaction debris")
  discardDownload("component:transaction-rollback")
}

async function rangeResumeTest(): Promise<void> {
  clearAll()
  const bytes = encoder.encode("0123456789")
  let calls = 0
  const statuses: string[] = []
  const unsubscribe = subscribeDownloads(records => {
    const record = records.find(item => item.id === "mod:range-test")
    if (record != null) statuses.push(record.status)
  })
  ;(globalThis as any).__scriptingFetch = async (_url: string, options: FetchOptions) => {
    calls += 1
    if (calls === 1) {
      assert(options.headers?.Range == null, "Fresh download unexpectedly sent Range")
      return response(200, { "content-length": "10", etag: '"fixture-v1"' }, [
        new TestData(bytes.slice(0, 4)),
        new Error("simulated connection loss"),
      ])
    }
    assert(options.headers?.Range === "bytes=4-", "Retry did not resume at the persisted byte offset")
    assert(options.headers?.["If-Range"] === '"fixture-v1"', "Retry did not bind Range to the saved ETag")
    return response(206, {
      "content-length": "6",
      "content-range": "bytes 4-9/10",
      etag: '"fixture-v1"',
    }, [new TestData(bytes.slice(4, 7)), new TestData(bytes.slice(7))])
  }
  const data = await downloadVerifiedData(spec("mod:range-test", "mod", "Range fixture", "fixture.zip", bytes))
  unsubscribe()
  assert(Buffer.from(data.toUint8Array()).equals(Buffer.from(bytes)), "Resumed bytes differ from source")
  const record = loadDownloadRecords().find(item => item.id === "mod:range-test")
  assert(calls === 2 && record?.status === "completed" && record.resumable === "yes" && record.attempt === 2,
    "Range-resumed download state is incorrect")
  assert(statuses.includes("retrying") && statuses.includes("verifying"), "Retry/verifying progress was not observable")
  discardDownload("mod:range-test")
}

async function ignoredRangeRestartTest(): Promise<void> {
  clearAll()
  const bytes = encoder.encode("abcdefghij")
  let calls = 0
  ;(globalThis as any).__scriptingFetch = async (_url: string, options: FetchOptions) => {
    calls += 1
    if (calls === 1) {
      return response(200, { "content-length": "10", etag: '"old"' }, [
        new TestData(bytes.slice(0, 3)),
        new Error("drop"),
      ])
    }
    assert(options.headers?.Range === "bytes=3-", "Ignored-range fixture was not resumed first")
    // A server may ignore Range or return a changed object as 200. The manager
    // must truncate the partial before accepting these full bytes.
    return response(200, { "content-length": "10", etag: '"new"' }, [new TestData(bytes)])
  }
  const data = await downloadVerifiedData(spec(
    "component:ignored-range", "component", "Ignored Range fixture", "engine.love", bytes,
  ))
  const record = loadDownloadRecords().find(item => item.id === "component:ignored-range")
  assert(data.size === bytes.length && record?.resumable === "no", "A 200 Range fallback was concatenated or mislabeled")
  discardDownload("component:ignored-range")
}

async function invalid206RestartCase(id: string, contentRange: string): Promise<void> {
  clearAll()
  const bytes = encoder.encode("range-206")
  let calls = 0
  const originalNow = Date.now
  let clock = originalNow()
  Date.now = () => { clock += 60_000; return clock }
  try {
    ;(globalThis as any).__scriptingFetch = async (_url: string, options: FetchOptions) => {
      calls += 1
      if (calls === 1) {
        assert(options.headers?.Range == null, `${id} unexpectedly started with Range`)
        return response(200, { "content-length": String(bytes.length), etag: '"range-v1"' }, [
          new TestData(bytes.slice(0, 3)),
          new Error("drop before invalid 206"),
        ])
      }
      if (calls === 2) {
        assert(options.headers?.Range === "bytes=3-", `${id} did not request its saved range`)
        return response(206, {
          "content-length": String(bytes.length - 3),
          "content-range": contentRange,
          etag: '"range-v1"',
        }, [new TestData(bytes.slice(3))])
      }
      assert(options.headers?.Range == null, `${id} did not restart from byte zero after invalid 206`)
      return response(200, { "content-length": String(bytes.length), etag: '"range-v1"' }, [new TestData(bytes)])
    }
    const data = await downloadVerifiedData(spec(`mod:${id}`, "mod", `${id} fixture`, `${id}.zip`, bytes))
    assert(data.size === bytes.length && calls === 3, `${id} did not recover through one clean zero-byte restart`)
  } finally {
    Date.now = originalNow
  }
  discardDownload(`mod:${id}`)
}

async function malformedAndMismatched206Test(): Promise<void> {
  await invalid206RestartCase("malformed-206", "not-a-content-range")
  await invalid206RestartCase("mismatched-206", "bytes 2-8/9")
}

async function pauseResumeTest(): Promise<void> {
  clearAll()
  const bytes = encoder.encode("pause-me")
  let mode: "slow" | "resume" = "slow"
  ;(globalThis as any).__scriptingFetch = async (_url: string, options: FetchOptions) => {
    if (mode === "resume") return response(200, { "content-length": String(bytes.length) }, [new TestData(bytes)])
    return {
      status: 200,
      ok: true,
      headers: { get: (name: string) => name.toLowerCase() === "content-length" ? String(bytes.length) : null },
      expectedContentLength: bytes.length,
      dataStream: {
        getReader: () => ({
          read: async () => {
            await new Promise(resolve => setTimeout(resolve, 30))
            if (options.signal?.aborted) throw new Error("aborted")
            return { done: false, value: new TestData(bytes) }
          },
          releaseLock: () => undefined,
        }),
      },
    }
  }
  const pending = downloadVerifiedData(spec("ipa:pause-test", "ipa", "Pause fixture", "test.ipa", bytes))
  await new Promise(resolve => setTimeout(resolve, 5))
  pauseDownload("ipa:pause-test")
  const error = await rejected(pending)
  assert(isDownloadControlError(error), "User pause was not reported as a control action")
  assert(loadDownloadRecords().find(item => item.id === "ipa:pause-test")?.status === "paused",
    "Paused record was not persisted")
  mode = "resume"
  await resumeDownload("ipa:pause-test")
  assert(loadDownloadRecords().find(item => item.id === "ipa:pause-test")?.status === "completed",
    "Paused download did not resume to verified completion")
  discardDownload("ipa:pause-test")
}

async function queuedCancelReuseTest(): Promise<void> {
  clearAll()
  const blockerBytes = encoder.encode("blocker")
  const queuedBytes = encoder.encode("queued-reuse")
  let releaseBlock!: () => void
  const blocked = new Promise<void>(resolve => { releaseBlock = resolve })
  let blockerReads = 0
  let queuedFetches = 0
  ;(globalThis as any).__scriptingFetch = async (url: string) => {
    if (url.endsWith("blocker.zip")) {
      return {
        status: 200,
        ok: true,
        headers: { get: (name: string) => name.toLowerCase() === "content-length" ? String(blockerBytes.length) : null },
        expectedContentLength: blockerBytes.length,
        dataStream: {
          getReader: () => ({
            read: async () => {
              if (blockerReads++ > 0) return { done: true }
              await blocked
              return { done: false, value: new TestData(blockerBytes) }
            },
            releaseLock: () => undefined,
          }),
        },
      }
    }
    queuedFetches += 1
    return response(200, { "content-length": String(queuedBytes.length) }, [new TestData(queuedBytes)])
  }

  const blocker = downloadVerifiedData(spec("mod:blocker", "mod", "Blocker fixture", "blocker.zip", blockerBytes))
  const queued = downloadVerifiedData(spec("mod:queued-reuse", "mod", "Queued cancel fixture", "queued.zip", queuedBytes))
  const queuedOutcome = queued.then(
    () => ({ ok: true as const, error: null }),
    error => ({ ok: false as const, error }),
  )
  await new Promise(resolve => setTimeout(resolve, 5))
  assert(loadDownloadRecords().find(item => item.id === "mod:queued-reuse")?.status === "queued",
    "Second serial download did not remain queued behind the active transfer")
  cancelDownload("mod:queued-reuse")
  releaseBlock()
  await blocker
  const outcome = await queuedOutcome
  assert(!outcome.ok && isDownloadControlError(outcome.error), "Queued cancellation did not settle as a control action")
  assert(queuedFetches === 0 && !loadDownloadRecords().some(item => item.id === "mod:queued-reuse"),
    "Queued cancellation fetched data or retained queue state")

  const reused = await downloadVerifiedData(spec(
    "mod:queued-reuse", "mod", "Queued cancel fixture", "queued.zip", queuedBytes,
  ))
  assert(reused.size === queuedBytes.length && queuedFetches === 1,
    "A cancelled queued id retained stale control state and could not be reused")
  discardDownload("mod:blocker")
  discardDownload("mod:queued-reuse")
}

async function activeCancelAndDiscardTest(): Promise<void> {
  clearAll()
  const cancelBytes = encoder.encode("cancel-active")
  let releaseRead!: () => void
  const waiting = new Promise<void>(resolve => { releaseRead = resolve })
  ;(globalThis as any).__scriptingFetch = async (_url: string, options: FetchOptions) => ({
    status: 200,
    ok: true,
    headers: { get: (name: string) => name.toLowerCase() === "content-length" ? String(cancelBytes.length) : null },
    expectedContentLength: cancelBytes.length,
    dataStream: {
      getReader: () => {
        let read = false
        return {
          read: async () => {
            if (read) return { done: true }
            read = true
            await waiting
            if (options.signal?.aborted) throw new Error("aborted")
            return { done: false, value: new TestData(cancelBytes) }
          },
          releaseLock: () => undefined,
        }
      },
    },
  })
  const pending = downloadVerifiedData(spec("ipa:cancel-active", "ipa", "Active cancel fixture", "cancel.ipa", cancelBytes))
  await new Promise(resolve => setTimeout(resolve, 5))
  const partialFile = loadDownloadRecords().find(item => item.id === "ipa:cancel-active")?.partialFile
  assert(partialFile != null, "Active cancellation fixture did not create queue metadata")
  cancelDownload("ipa:cancel-active")
  releaseRead()
  const error = await rejected(pending)
  assert(isDownloadControlError(error), "Active cancellation did not settle as a control action")
  assert(!loadDownloadRecords().some(item => item.id === "ipa:cancel-active")
    && !__testFiles.has(partialPath(partialFile)), "Active cancellation retained its record or partial bytes")

  const completedBytes = encoder.encode("discard-completed")
  ;(globalThis as any).__scriptingFetch = async () => response(
    200, { "content-length": String(completedBytes.length) }, [new TestData(completedBytes)],
  )
  await downloadVerifiedData(spec("ipa:discard", "ipa", "Discard fixture", "discard.ipa", completedBytes))
  const completed = loadDownloadRecords().find(item => item.id === "ipa:discard")
  assert(completed != null && __testFiles.has(partialPath(completed.partialFile)),
    "Completed discard fixture did not retain its verified handoff bytes")
  discardDownload("ipa:discard")
  assert(!loadDownloadRecords().some(item => item.id === "ipa:discard")
    && !__testFiles.has(partialPath(completed.partialFile)), "Discard retained completed metadata or bytes")
}

async function sizeAndHashFailureTest(): Promise<void> {
  clearAll()
  const bytes = encoder.encode("integrity")

  ;(globalThis as any).__scriptingFetch = async () => response(
    200, { "content-length": String(bytes.length - 1) }, [new TestData(bytes.slice(0, bytes.length - 1))],
  )
  const sizeError = await rejected(downloadVerifiedData(spec(
    "component:size-failure", "component", "Size failure fixture", "size.love", bytes,
  )))
  const sizeRecord = loadDownloadRecords().find(item => item.id === "component:size-failure")
  assert(sizeError instanceof Error && sizeRecord?.status === "failed"
    && sizeRecord.error?.includes("does not match verified metadata"),
    "Declared response-size mismatch was not a permanent visible failure")
  discardDownload("component:size-failure")

  const wrong = encoder.encode("integriXy")
  assert(wrong.length === bytes.length, "Hash fixture must preserve the trusted size")
  ;(globalThis as any).__scriptingFetch = async () => response(
    200, { "content-length": String(wrong.length) }, [new TestData(wrong)],
  )
  const hashError = await rejected(downloadVerifiedData(spec(
    "component:hash-failure", "component", "Hash failure fixture", "hash.love", bytes,
  )))
  const hashRecord = loadDownloadRecords().find(item => item.id === "component:hash-failure")
  assert(hashError instanceof Error && hashRecord?.status === "failed" && hashRecord.downloadedBytes === 0
    && hashRecord.error?.includes("SHA-256") && !__testFiles.has(partialPath(hashRecord.partialFile)),
    "SHA-256 failure did not discard untrusted bytes and retain a visible failure")
  discardDownload("component:hash-failure")
}

async function main(): Promise<void> {
  await processReloadAndBackupRecoveryTest()
  await transactionRollbackTest()
  await rangeResumeTest()
  await ignoredRangeRestartTest()
  await malformedAndMismatched206Test()
  await pauseResumeTest()
  await queuedCancelReuseTest()
  await activeCancelAndDiscardTest()
  await sizeAndHashFailureTest()
  assert(!__testFiles.has(DOWNLOAD_STATE_BACKUP_FILE) && !__testFiles.has(DOWNLOAD_STATE_TEMP_FILE),
    "Download transactions left fixed backup/temp debris after the full matrix")
  console.log("Persistent download manager tests passed")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
