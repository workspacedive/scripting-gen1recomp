import { __testFiles } from "./scripting-node-stub"
import {
  acceptWebDiagnosticEnvelope,
  beginDiagnosticSession,
  createDiagnosticExport,
  endDiagnosticSession,
  flushDiagnostics,
  recordDiagnostic,
} from "../modules/diagnostics"
import { DIAGNOSTIC_LOG_FILE } from "../modules/paths"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const manager = FileManager as unknown as {
  appendText: (path: string, value: string) => Promise<void>
  appendTextSync: (path: string, value: string) => void
}
const originalAsyncAppend = manager.appendText
const originalSyncAppend = manager.appendTextSync
let asynchronousAppends = 0
let synchronousFallbacks = 0
let failNextAsynchronousAppend = false
manager.appendText = async (path, value) => {
  asynchronousAppends += 1
  if (failNextAsynchronousAppend) {
    failNextAsynchronousAppend = false
    throw new Error("injected async append failure")
  }
  await originalAsyncAppend(path, value)
}
manager.appendTextSync = (path, value) => {
  synchronousFallbacks += 1
  originalSyncAppend(path, value)
}

async function main(): Promise<void> {
  const session = beginDiagnosticSession("diagnostic-batch-test")
  for (let index = 0; index < 100; index += 1) {
    recordDiagnostic(session, "fixture", "debug", "native_row", `native-${index}`)
  }
  assert(asynchronousAppends === 0,
    "Diagnostic records synchronously entered FileManager before a batch flush")
  await flushDiagnostics()
  assert(asynchronousAppends === 1 && synchronousFallbacks === 0,
    "One hundred native records were not persisted in one asynchronous batch")

  const entries = Array.from({ length: 40 }, (_, index) => ({
    sequence: index + 1,
    occurredAt: new Date(1_700_000_000_000 + index).toISOString(),
    elapsedMs: index,
    source: "console",
    level: "info",
    event: "log",
    message: `web-${index}`,
  }))
  const accepted = acceptWebDiagnosticEnvelope(session, { schema: 1, entries })
  assert(accepted.ok && accepted.accepted === 40 && accepted.rejected === 0,
    "Valid Web diagnostic batch was not accepted intact")
  await flushDiagnostics()
  assert(asynchronousAppends === 2,
    "Web diagnostic envelope was not coalesced into one native file append")

  failNextAsynchronousAppend = true
  recordDiagnostic(session, "fixture", "error", "fallback_row", "fallback-evidence")
  await flushDiagnostics()
  assert(asynchronousAppends === 3 && synchronousFallbacks === 1,
    "A failed async batch did not use exactly one whole-batch synchronous fallback")

  await endDiagnosticSession(session, "passed")
  const rawBytes = __testFiles.get(DIAGNOSTIC_LOG_FILE)
  assert(rawBytes != null, "Diagnostic log was not created")
  const raw = new TextDecoder().decode(rawBytes)
  const rows = raw.trim().split("\n").map(line => JSON.parse(line) as { message: string; event: string })
  const nativeRows = rows.filter(row => row.event === "native_row")
  const webRows = rows.filter(row => row.message.startsWith("web-"))
  assert(nativeRows.length === 100 && nativeRows[0].message === "native-0"
      && nativeRows[99].message === "native-99",
    "Native diagnostic batching lost or reordered records")
  assert(webRows.length === 40 && webRows[0].message === "web-0"
      && webRows[39].message === "web-39",
    "Web diagnostic batching lost or reordered records")
  assert(rows.some(row => row.message === "fallback-evidence")
      && rows[rows.length - 1].event === "session_end",
    "Fallback or terminal durability boundary lost evidence")

  const exportPath = await createDiagnosticExport("txt", { fixture: true })
  const exportBytes = __testFiles.get(exportPath)
  assert(exportBytes != null, "Diagnostic export was not written")
  const exported = new TextDecoder().decode(exportBytes)
  assert(exported.includes("fallback-evidence") && exported.includes("web-39"),
    "Explicit export did not flush and include complete diagnostics")
  assert(asynchronousAppends <= 4,
    "Batching regressed toward one file append per diagnostic record")
  console.log("Ordered asynchronous diagnostic batching tests passed")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  manager.appendText = originalAsyncAppend
  manager.appendTextSync = originalSyncAppend
})
