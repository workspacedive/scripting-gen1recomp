import { Path, Script } from "scripting"

export const SUITE_ROOT = Path.join(FileManager.documentsDirectory, "Gen1Recomp Native Suite")
export const LIBRARY_ROOT = Path.join(SUITE_ROOT, "Library")
export const SAVES_ROOT = Path.join(SUITE_ROOT, "Gen1Recomp Saves")
export const MODS_ROOT = Path.join(SUITE_ROOT, "Mods")
export const DOWNLOADS_ROOT = Path.join(SUITE_ROOT, "Official Downloads")
export const DOWNLOAD_MANAGER_ROOT = Path.join(SUITE_ROOT, "Download Manager")
export const DOWNLOAD_PARTIALS_ROOT = Path.join(DOWNLOAD_MANAGER_ROOT, "Partials")
export const DOWNLOAD_STATE_FILE = Path.join(DOWNLOAD_MANAGER_ROOT, "downloads.json")
export const DOWNLOAD_STATE_BACKUP_FILE = Path.join(DOWNLOAD_MANAGER_ROOT, "downloads.backup.json")
export const DOWNLOAD_STATE_TEMP_FILE = Path.join(DOWNLOAD_MANAGER_ROOT, "downloads.tmp.json")
export const COMPONENTS_ROOT = Path.join(SUITE_ROOT, "Runtime Components")
export const DIAGNOSTICS_ROOT = Path.join(SUITE_ROOT, "Diagnostics")
export const DIAGNOSTIC_LOG_FILE = Path.join(DIAGNOSTICS_ROOT, "runtime-console.jsonl")
export const DIAGNOSTIC_PREVIOUS_LOG_FILE = Path.join(DIAGNOSTICS_ROOT, "runtime-console.previous.jsonl")
export const LIBRARY_FILE = Path.join(SUITE_ROOT, "library.json")
export const MOD_LIBRARY_FILE = Path.join(SUITE_ROOT, "mods.json")
export const MOD_LIBRARY_BACKUP_FILE = Path.join(SUITE_ROOT, "mods.backup.json")
export const MOD_STATE_MIRROR_FILE = Path.join(SAVES_ROOT, "native_mod_state.json")
export const MOD_OPTIONS_MIRROR_FILE = Path.join(SAVES_ROOT, "native_mod_options.json")
export const MOD_OPTIONS_BACKUP_FILE = Path.join(SUITE_ROOT, "native_mod_options.backup.json")
export const RELEASE_CACHE_FILE = Path.join(SUITE_ROOT, "official-release.json")
export const SETTINGS_FILE = Path.join(SUITE_ROOT, "settings.json")
export const SETTINGS_BACKUP_FILE = Path.join(SUITE_ROOT, "settings.backup.json")
export const COMPONENT_STATE_FILE = Path.join(COMPONENTS_ROOT, "components.json")
export const RUNTIME_TEMP_ROOT = Path.join(FileManager.temporaryDirectory, "Gen1Recomp Native Suite Runtime")
export const RUNTIME_RECOVERY_FILE = Path.join(SUITE_ROOT, "runtime-recovery.json")
export const RUNTIME_RECOVERY_TEMP_FILE = Path.join(SUITE_ROOT, "runtime-recovery.tmp.json")

export function gameDirectory(id: string): string {
  return Path.join(LIBRARY_ROOT, id)
}

export function gameRomPath(id: string, romFileName: string): string {
  return Path.join(gameDirectory(id), romFileName)
}

export function bundledCoverPath(edition: string): string {
  const safeEdition = ["red", "blue", "yellow", "gold"].includes(edition) ? edition : "custom"
  return Path.join(Script.directory, "assets", "covers", `${safeEdition}.png`)
}

export function bundledRuntimePath(name: string): string {
  return Path.join(Script.directory, "runtime", name)
}

export function ensureStorage(): void {
  for (const directory of [SUITE_ROOT, LIBRARY_ROOT, SAVES_ROOT, MODS_ROOT, DOWNLOADS_ROOT, DOWNLOAD_MANAGER_ROOT, DOWNLOAD_PARTIALS_ROOT, COMPONENTS_ROOT, DIAGNOSTICS_ROOT]) {
    if (!FileManager.existsSync(directory)) FileManager.createDirectorySync(directory, true)
  }
}
