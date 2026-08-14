import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { __testFiles } from "./scripting-node-stub"
import { activeEngineLayersAsync } from "../modules/components"
import { COMPONENTS_ROOT, COMPONENT_STATE_FILE } from "../modules/paths"
import { decodeUtf8, extractLocalZipEntry, readLocalZip } from "../modules/zip"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const core = new Uint8Array(readFileSync("runtime/gen1recomp-core-0.1.78.love"))
const coreSha256 = createHash("sha256").update(core).digest("hex")
const oldLayer = encoder.encode("verified revision-8 fixture layer")
const oldLayerSha256 = createHash("sha256").update(oldLayer).digest("hex")
const corePath = `${COMPONENTS_ROOT}/gen1recomp-core-active.love`
const layerPath = `${COMPONENTS_ROOT}/gen1recomp-layer-active.love`
const overridePath = `${COMPONENTS_ROOT}/gen1recomp-layer-override.love`

function revision8State(): string {
  return JSON.stringify({
    schema: 1,
    engine: {
      version: "0.1.81",
      file: "gen1recomp-layer-active.love",
      sourceFile: "gen1recomp-core-active.love",
      patchRevision: 8,
      sourceSha256: coreSha256,
      installedSha256: oldLayerSha256,
      installedAt: "2026-08-13T12:00:00.000Z",
    },
    executionLayer: {
      version: "2.0.1",
      file: "gen1recomp-layer-override.love",
      patchRevision: 8,
      coreSha256,
      sha256: oldLayerSha256,
      installedAt: "2026-08-13T12:05:00.000Z",
    },
  }, null, 2)
}

function installRevision8Fixture(): void {
  __testFiles.set(corePath, core.slice())
  __testFiles.set(layerPath, oldLayer.slice())
  __testFiles.set(overridePath, oldLayer.slice())
  __testFiles.set(COMPONENT_STATE_FILE, encoder.encode(revision8State()))
}

type LayerManifest = {
  enginePatchRevision: number
  version: string
  core: { version: string; sha256: string }
}

function manifestFrom(layer: Uint8Array): LayerManifest {
  const entry = readLocalZip(layer).find(item => item.path === "layer-manifest.json")
  assert(entry != null, "Migrated layer has no manifest")
  return JSON.parse(decodeUtf8(extractLocalZipEntry(layer, entry))) as LayerManifest
}

async function main(): Promise<void> {
  installRevision8Fixture()
  const migrated = await activeEngineLayersAsync()
  assert(migrated.migration?.status === "upgraded", "Revision-8 migration was not reported")
  assert(migrated.source === "installed" && migrated.layerSource === "engine",
    "Migrated installed core/layer pair did not activate")
  assert(migrated.coreVersion === "0.1.81" && migrated.coreSha256 === coreSha256,
    "Migration replaced or rebound the immutable installed core")
  assert(createHash("sha256").update(migrated.core.toUint8Array()!).digest("hex") === coreSha256,
    "Migration changed immutable installed core bytes")
  const manifest = manifestFrom(migrated.layer.toUint8Array()!)
  assert(manifest.enginePatchRevision === 9 && manifest.version === "2.1.0",
    "Migrated source layer does not carry revision 9 / version 2.1.0")
  assert(manifest.core.version === "0.1.81" && manifest.core.sha256 === coreSha256,
    "Migrated source layer is not bound to the retained installed core")
  const state = JSON.parse(decoder.decode(__testFiles.get(COMPONENT_STATE_FILE)!))
  assert(state.engine.patchRevision === 9 && state.engine.sourceSha256 === coreSha256,
    "Migrated component state was not committed")
  assert(state.executionLayer == null && !__testFiles.has(overridePath),
    "Revision-8 independent override survived capability migration")

  // A failure after the old layer backup must restore both bytes and exact old
  // state; selection then uses the complete bundled pair, never half a pair.
  installRevision8Fixture()
  const manager = FileManager as unknown as {
    rename: (source: string, destination: string) => Promise<void>
  }
  const originalRename = manager.rename
  let injected = false
  manager.rename = async (source: string, destination: string) => {
    if (!injected && source.includes(".layer-migration-")
        && destination.endsWith("gen1recomp-layer-active.love")) {
      injected = true
      throw new Error("injected migration activation failure")
    }
    return originalRename(source, destination)
  }
  const fallback = await activeEngineLayersAsync()
  manager.rename = originalRename
  assert(injected && fallback.migration?.status === "failed-bundled-fallback",
    "Migration failure was not contained and reported")
  assert(fallback.source === "bundled" && fallback.layerSource === "bundled",
    "Failed migration did not select the complete bundled pair")
  assert(decoder.decode(__testFiles.get(layerPath)!) === decoder.decode(oldLayer),
    "Failed migration did not restore revision-8 layer bytes")
  assert(decoder.decode(__testFiles.get(COMPONENT_STATE_FILE)!) === revision8State(),
    "Failed migration did not preserve exact revision-8 component state")
  console.log("Revision-8 to revision-9 execution-layer migration tests passed")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
