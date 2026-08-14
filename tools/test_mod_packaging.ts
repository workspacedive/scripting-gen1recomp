import { createHash } from "node:crypto"
import { __testFiles } from "./scripting-node-stub"
import { modPackageFiles, saveModLibrary } from "../modules/mods"
import { MODS_ROOT } from "../modules/paths"
import type { InstalledMod, ModLibraryDocument } from "../modules/types"
import { createStoredZip } from "../modules/zip"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const encoder = new TextEncoder()

function fixture(id: string, enabled: boolean): { record: InstalledMod; archive: Uint8Array } {
  const manifest = encoder.encode(JSON.stringify({
    id,
    name: id,
    version: "1.0.0",
    api: 2,
    entry: "main.lua",
    permissions: [],
    dependencies: [],
    conflicts: [],
  }))
  const main = encoder.encode("return function() end\n")
  const archive = createStoredZip([
    { path: "manifest.json", bytes: manifest },
    { path: "main.lua", bytes: main },
  ])
  const now = "2026-08-13T12:00:00.000Z"
  return {
    archive,
    record: {
      id,
      name: id,
      version: "1.0.0",
      description: "",
      entry: "main.lua",
      api: 2,
      enabled,
      permissions: [],
      dependencies: [],
      conflicts: [],
      archiveSha256: "0".repeat(64),
      storage: "archive",
      packageSha256: createHash("sha256").update(archive).digest("hex"),
      byteLength: manifest.length + main.length,
      fileCount: 2,
      installedAt: now,
      updatedAt: now,
    },
  }
}

async function main(): Promise<void> {
  const enabled = fixture("enabled_fixture", true)
  const disabled = fixture("disabled_fixture", false)
  const library: ModLibraryDocument = { schemaVersion: 1, mods: [enabled.record, disabled.record] }
  __testFiles.set(`${MODS_ROOT}/${enabled.record.id}/package.zip`, enabled.archive)
  __testFiles.set(`${MODS_ROOT}/${disabled.record.id}/package.zip`, disabled.archive)
  saveModLibrary(library)

  const first = await modPackageFiles()
  const firstNames = first.map(file => file.filename)
  assert(firstNames.some(name => name.endsWith("/enabled_fixture.zip")),
    "Enabled packed mod was omitted from launch payload")
  assert(!firstNames.some(name => name.endsWith("/disabled_fixture.zip")),
    "Disabled packed mod bytes entered the launch payload")
  const stateFile = first.find(file => file.filename.endsWith("/native_mod_state.json"))
  assert(stateFile != null, "Complete native mod-state mirror was omitted")
  const state = JSON.parse(stateFile.data.toRawString("utf-8")) as {
    schema: number; mods: Record<string, boolean>
  }
  assert(state.schema === 1 && state.mods.enabled_fixture === true
      && state.mods.disabled_fixture === false,
    "Native mod-state mirror did not retain both enabled and disabled ids")

  disabled.record.enabled = true
  saveModLibrary(library)
  const secondNames = (await modPackageFiles()).map(file => file.filename)
  assert(secondNames.some(name => name.endsWith("/disabled_fixture.zip")),
    "Natively re-enabled mod was not selected on the next launch")
  console.log("Enabled-only mod payload selection tests passed")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
