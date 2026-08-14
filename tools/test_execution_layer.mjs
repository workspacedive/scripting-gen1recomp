import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { createCompatibilityLayerLove, EXECUTION_LAYER_REVISION } from "../modules/engine-patcher.ts"
import { decodeUtf8, extractLocalZipEntry, readLocalZip } from "../modules/zip.ts"

const sourcePath = process.argv[2]
if (sourcePath == null) {
  throw new Error("Usage: test_execution_layer.mjs /path/to/official.love [output.love]")
}
const sourceBuffer = readFileSync(sourcePath)
const source = new Uint8Array(sourceBuffer)
const coreSha256 = createHash("sha256").update(sourceBuffer).digest("hex")
const bit = new Uint8Array(readFileSync(new URL("../runtime/patches/bit.lua", import.meta.url)))
const contract = {
  layerVersion: "2.1.0",
  suiteMinimum: "3.5.0",
  coreVersion: "0.1.78",
  coreSha256,
}
const layer = createCompatibilityLayerLove(source, bit, contract)
const entries = readLocalZip(layer)
const files = new Map()
for (const entry of entries) {
  if (entry.type === "file") files.set(entry.path, extractLocalZipEntry(layer, entry))
}

assert.equal(files.size, 14)
assert.deepEqual([...files.keys()].sort(), [
  "bit.lua",
  "compat/core-conf.lua",
  "compat/core-main.lua",
  "conf.lua",
  "layer-manifest.json",
  "main.lua",
  "src/core/Music.lua",
  "src/core/SaveData.lua",
  "src/core/TouchControls.lua",
  "src/debug/SwitchDiagnostics.lua",
  "src/import/CacheFs.lua",
  "src/mods/AssetTransform.lua",
  "src/mods/Loader.lua",
  "src/update/Boot.lua",
].sort())
assert.equal(files.has("src/core/Version.lua"), false)
assert.equal(files.has("data"), false)

const manifest = JSON.parse(decodeUtf8(files.get("layer-manifest.json")))
assert.equal(manifest.id, "gen1recomp-execution-layer")
assert.equal(manifest.enginePatchRevision, EXECUTION_LAYER_REVISION)
assert.equal(manifest.upstreamCore.sha256, coreSha256)
assert.equal(manifest.upstreamCore.bytes, source.length)
assert.equal(manifest.upstreamCore.immutable, true)
assert.equal(manifest.execution.coreMount, "verified-memory-appended")
assert.equal(manifest.execution.saveIdentity, "appended-non-executable")
assert.equal(manifest.execution.updater, "host-verified-components-only")
assert.equal(manifest.layer.revision, EXECUTION_LAYER_REVISION)
assert.equal(manifest.core.sha256, coreSha256)
assert.equal(manifest.build.deterministic, true)
assert.equal(manifest.files.length, files.size - 1)
for (const declared of manifest.files) {
  const payload = files.get(declared.path)
  assert.ok(payload, `missing declared layer file ${declared.path}`)
  assert.equal(payload.length, declared.bytes)
  assert.equal(createHash("sha256").update(payload).digest("hex"), declared.sha256)
}

const conf = decodeUtf8(files.get("conf.lua"))
const main = decodeUtf8(files.get("main.lua"))
const coreMain = decodeUtf8(files.get("compat/core-main.lua"))
const updateBoot = decodeUtf8(files.get("src/update/Boot.lua"))
assert.match(conf, /\/gen1recomp-core\.love/)
assert.match(conf, /dataModule\.hash\("sha256", core\)/)
assert.match(conf, /love\.filesystem\.mount\(coreFile, "", true\)/)
assert.match(conf, /t\.appendidentity = true/)
assert.match(main, /getSaveDirectory/)
assert.match(main, /compat\/core-main\.lua/)
assert.match(coreMain, /web-rom-/)
assert.match(coreMain, /GEN1RECOMP_LUA51_SOURCE/)
assert.match(coreMain, /rewritePotatoVoxel144WebGuards/)
assert.match(coreMain, /@mods\/potato_voxel\/lib\/SpriteBillboards\.lua/)
assert.match(coreMain, /@mods\/potato_voxel\/lib\/OverworldBattle\.lua/)
assert.match(coreMain, /@mods\/potato_voxel\/lib\/VoxelScene\.lua/)
assert.match(main, /src\/update\/Boot\.lua/)
assert.match(updateBoot, /writable updater payload execution is disabled/)
assert.match(updateBoot, /love\.filesystem\.remove/)
assert.doesNotMatch(updateBoot, /love\.filesystem\.mount/)
assert.doesNotMatch(updateBoot, /love\.filesystem\.load/)
assert.doesNotMatch(updateBoot, /loadstring/)
assert.doesNotMatch(main, /web-rom-/)

// The generated archive must be deterministic, and generation must not alter
// the caller's immutable upstream bytes.
const second = createCompatibilityLayerLove(source, bit, contract)
assert.deepEqual(second, layer)
assert.equal(createHash("sha256").update(source).digest("hex"), coreSha256)

if (process.argv[3] != null) writeFileSync(process.argv[3], layer)
console.log("Execution-layer tests passed:", layer.length, "bytes,", files.size,
  "files, core", coreSha256)
