import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { __testFiles } from "./scripting-node-stub"
import { createCompatibilityLayerLove } from "../modules/engine-patcher"
import {
  activeComponentStatus,
  activeEngineLayersAsync,
  installExecutionLayer,
  resetExecutionLayer,
} from "../modules/components"
import { COMPONENTS_ROOT } from "../modules/paths"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function rejected(task: Promise<unknown>): Promise<unknown> {
  try {
    await task
    return null
  } catch (error) {
    return error
  }
}

const core = new Uint8Array(readFileSync("runtime/gen1recomp-core-0.1.78.love"))
const bit = new Uint8Array(readFileSync("runtime/patches/bit.lua"))
const coreSha256 = createHash("sha256").update(core).digest("hex")

function layer(version: string, digest = coreSha256): Uint8Array {
  return createCompatibilityLayerLove(core, bit, {
    layerVersion: version,
    suiteMinimum: "3.5.0",
    coreVersion: "0.1.78",
    coreSha256: digest,
  })
}

async function main(): Promise<void> {
  const input201 = "/tmp/gen1-layer-2.1.1.love"
  const bytes201 = layer("2.1.1")
  __testFiles.set(input201, bytes201)

  const initial = activeComponentStatus()
  assert(initial.executionLayerVersion === "2.1.0" && initial.executionLayerSource === "bundled",
    "The bundled execution layer was not the initial source")
  const installed = await installExecutionLayer(input201)
  assert(installed.executionLayerVersion === "2.1.1" && installed.executionLayerSource === "installed",
    "The independently imported execution layer did not activate")
  const active = await activeEngineLayersAsync()
  assert(active.layerVersion === "2.1.1" && active.layerSource === "installed",
    "The active pair did not select the independent execution layer")
  assert(createHash("sha256").update(active.layer.toUint8Array()!).digest("hex")
    === createHash("sha256").update(bytes201).digest("hex"),
    "Activated layer bytes differ from the verified import")

  const downgrade = "/tmp/gen1-layer-2.1.0-downgrade.love"
  __testFiles.set(downgrade, layer("2.1.0"))
  const downgradeError = await rejected(installExecutionLayer(downgrade))
  assert(downgradeError instanceof Error && downgradeError.message.includes("increase monotonically"),
    "A same/older execution-layer version was not rejected")

  const mismatch = "/tmp/gen1-layer-2.1.2-wrong-core.love"
  __testFiles.set(mismatch, layer("2.1.2", "0".repeat(64)))
  const mismatchError = await rejected(installExecutionLayer(mismatch))
  assert(mismatchError instanceof Error && mismatchError.message.includes("incompatible"),
    "A layer for another immutable core was not rejected")

  // Fail after the existing override was backed up but before replacement.
  // The two renames and state must roll back to the active 2.1.1 layer.
  const input202 = "/tmp/gen1-layer-2.1.2.love"
  __testFiles.set(input202, layer("2.1.2"))
  const manager = FileManager as any
  const originalRename = manager.rename
  let injected = false
  manager.rename = async (source: string, destination: string) => {
    if (!injected && source.includes(".layer-override-")
        && destination.endsWith("gen1recomp-layer-override.love")) {
      injected = true
      throw new Error("injected layer activation failure")
    }
    return originalRename(source, destination)
  }
  const transactionError = await rejected(installExecutionLayer(input202))
  manager.rename = originalRename
  assert(transactionError instanceof Error && injected,
    "The layer transaction failure fixture did not trigger")
  const rolledBack = await activeEngineLayersAsync()
  assert(rolledBack.layerVersion === "2.1.1" && rolledBack.layerSource === "installed",
    "Execution-layer transaction rollback did not restore the prior layer and state")

  // Corruption cannot partially activate; selection falls back to the complete
  // generated/bundled layer for the still-verified immutable core.
  const destination = `${COMPONENTS_ROOT}/gen1recomp-layer-override.love`
  const corrupted = bytes201.slice()
  corrupted[64] ^= 0xff
  __testFiles.set(destination, corrupted)
  const fallback = await activeEngineLayersAsync()
  assert(fallback.layerVersion === "2.1.0" && fallback.layerSource === "bundled",
    "A corrupt independent layer did not fall back safely")

  const reset = resetExecutionLayer()
  assert(reset.executionLayerVersion === "2.1.0" && reset.executionLayerSource === "bundled"
      && !__testFiles.has(destination),
    "Reset did not remove independent layer state and bytes")
  console.log("Independent execution-layer install tests passed")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
