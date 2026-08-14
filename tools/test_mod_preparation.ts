import { writeFileSync, unlinkSync } from "node:fs"
import { __testFiles } from "./scripting-node-stub"
import { prepareModArchive, discardPreparedMod } from "../modules/mods"
import { createStoredZip, readLocalZip, extractLocalZipEntry } from "../modules/zip"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const encoder = new TextEncoder()
const sourcePath = "/tmp/gen1recomp-bounded-worker-mod.zip"
const payload = Uint8Array.from({ length: 96 * 1024 }, (_, index) => (index * 31) & 0xff)
const archive = createStoredZip([
  {
    path: "fixture/manifest.json",
    bytes: encoder.encode(JSON.stringify({
      id: "worker_fixture",
      name: "Worker Fixture",
      version: "1.2.3",
      api: 2,
      entry: "main.lua",
      options_schema: "options.lua",
    })),
  },
  { path: "fixture/main.lua", bytes: encoder.encode("return function() end\n") },
  { path: "fixture/options.lua", bytes: encoder.encode("return {{ key='enabled', type='toggle', default=false }}\n") },
  { path: "fixture/assets/payload.bin", bytes: payload },
])
writeFileSync(sourcePath, archive)

let workerCalls = 0
;(globalThis as typeof globalThis & { Thread: { runInBackground<T>(execute: () => T | Promise<T>): Promise<T> } }).Thread.runInBackground = async execute => {
  workerCalls += 1
  return execute()
}

const progress: Array<{ stage: string; completed: number; total: number }> = []
try {
  const prepared = await prepareModArchive(sourcePath, { onProgress: update => progress.push(update) })
  assert(prepared.record.id === "worker_fixture" && prepared.record.version === "1.2.3", "Prepared manifest identity changed")
  assert(prepared.record.optionSchema?.rows.length === 1, "Literal option schema was not retained")
  assert(workerCalls >= 4, "ZIP parsing, verification, schema extraction, and repacking did not use background tasks")
  for (const stage of ["scanning", "verifying", "packing"]) {
    const updates = progress.filter(update => update.stage === stage)
    assert(updates.length >= 2, `${stage} progress did not expose bounded start/completion updates`)
    assert(updates[updates.length - 1].completed === updates[updates.length - 1].total, `${stage} progress did not complete exactly`)
  }
  const packagePath = `${prepared.directory}/package.zip`
  const packageBytes = __testFiles.get(packagePath)
  assert(packageBytes != null, "The normalized package was not written through asynchronous FileManager I/O")
  const entries = readLocalZip(packageBytes)
  assert(entries.map(entry => entry.path).join(",") === "manifest.json,main.lua,options.lua,assets/payload.bin",
    "Normalized package paths/order changed")
  const packedPayload = entries.find(entry => entry.path === "assets/payload.bin")
  assert(packedPayload != null, "Normalized payload is missing")
  const output = extractLocalZipEntry(packageBytes, packedPayload)
  assert(output.length === payload.length && output.every((value, index) => value === payload[index]),
    "Normalized payload bytes changed")
  discardPreparedMod(prepared)
} finally {
  try { unlinkSync(sourcePath) } catch {}
}

console.log("Background mod preparation tests passed")
