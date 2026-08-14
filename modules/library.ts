import { Path } from "scripting"
import type { EditionKey, GameRecord, ImportResult, LibraryDocument } from "./types"
import { identifyROM, inspectROM } from "./rom"
import { createStoredZip } from "./zip"
import type { StoredZipFile } from "./zip"
import {
  LIBRARY_FILE,
  RUNTIME_TEMP_ROOT,
  SAVES_ROOT,
  SUITE_ROOT,
  bundledCoverPath,
  ensureStorage,
  gameDirectory,
  gameRomPath,
} from "./paths"

const BACKUP_FILE = Path.join(SUITE_ROOT, "library.backup.json")

function emptyLibrary(): LibraryDocument {
  return {
    schemaVersion: 2,
    games: [],
    settings: { showRuntimeNotice: true },
  }
}

function isGameRecord(value: unknown): value is GameRecord {
  if (value == null || typeof value !== "object") return false
  const game = value as Partial<GameRecord>
  return typeof game.id === "string" && /^[a-z0-9-]+$/.test(game.id)
    && typeof game.title === "string" && game.title.length > 0 && game.title.length <= 200
    && typeof game.sha1 === "string" && /^[a-f0-9]{40}$/.test(game.sha1)
    && game.id.endsWith(game.sha1.slice(0, 16))
    && typeof game.romFileName === "string" && /^game\.(gb|gbc)$/.test(game.romFileName)
    && typeof game.byteLength === "number" && Number.isFinite(game.byteLength) && game.byteLength > 0
}

function safeOriginalName(name: string, colorMode: "GB" | "GBC"): string {
  const clean = name.replace(/[^a-zA-Z0-9 ._()\[\]-]/g, "_").slice(0, 96)
  if (/\.(gb|gbc)$/i.test(clean)) return clean
  return `${clean || "game"}.${colorMode === "GBC" ? "gbc" : "gb"}`
}

function parseLibrary(path: string): LibraryDocument | null {
  if (!FileManager.existsSync(path)) return null
  try {
    const parsed = JSON.parse(FileManager.readAsStringSync(path)) as {
      schemaVersion?: unknown
      games?: unknown
      settings?: { showRuntimeNotice?: unknown; showPlayerNotice?: unknown }
    }
    if ((parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2) || !Array.isArray(parsed.games)) return null
    const games = parsed.games.filter(isGameRecord).map(game => {
      const colorMode = game.colorMode === "GBC" || game.romFileName.endsWith(".gbc") ? "GBC" : "GB"
      const customCoverFileName = typeof game.customCoverFileName === "string"
        && /^custom-cover\.(png|jpe?g|heic|webp)$/i.test(game.customCoverFileName)
        ? game.customCoverFileName
        : undefined
      return {
        ...game,
        colorMode,
        originalFileName: safeOriginalName(game.originalFileName || "game", colorMode),
        playCount: typeof game.playCount === "number" && Number.isFinite(game.playCount) ? Math.max(0, Math.floor(game.playCount)) : 0,
        edition: ["red", "blue", "yellow", "gold", "custom"].includes(game.edition) ? game.edition : "custom",
        recompSupport: ["stable", "early", "unsupported"].includes(game.recompSupport) ? game.recompSupport : "unsupported",
        customCoverFileName,
      }
    }) as GameRecord[]
    return {
      schemaVersion: 2,
      games,
      settings: {
        showRuntimeNotice: parsed.settings?.showRuntimeNotice !== false
          && parsed.settings?.showPlayerNotice !== false,
      },
    }
  } catch (error) {
    console.error("Could not parse library:", error)
    return null
  }
}

export function loadLibrary(): LibraryDocument {
  ensureStorage()
  const primary = parseLibrary(LIBRARY_FILE)
  if (primary != null) return primary
  const backup = parseLibrary(BACKUP_FILE)
  if (backup != null) {
    FileManager.writeAsStringSync(LIBRARY_FILE, JSON.stringify(backup, null, 2))
    return backup
  }
  return emptyLibrary()
}

export function saveLibrary(library: LibraryDocument): void {
  ensureStorage()
  if (FileManager.existsSync(LIBRARY_FILE)) {
    if (FileManager.existsSync(BACKUP_FILE)) FileManager.removeSync(BACKUP_FILE)
    FileManager.copyFileSync(LIBRARY_FILE, BACKUP_FILE)
  }
  FileManager.writeAsStringSync(LIBRARY_FILE, JSON.stringify(library, null, 2))
}

function fileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || "game.gb"
}

function importROMPath(path: string, current: LibraryDocument): GameRecord {
  const sourceName = fileName(path)
  const sourceData = Data.fromFile(path)
  const bytes = sourceData?.toUint8Array()
  if (sourceData == null || bytes == null) throw new Error("The selected file could not be read.")
  const header = inspectROM(bytes)
  const sha1 = Crypto.sha1(sourceData).toHexString().toLowerCase()
  if (current.games.some(game => game.sha1 === sha1)) throw new Error("DUPLICATE")

  const match = identifyROM(sha1)
  if (match == null) {
    throw new Error("This ROM is valid, but it is not one of the canonical ROM revisions supported by Gen1Recomp v0.1.78.")
  }
  const edition: EditionKey = match.edition
  const id = `${edition}-${sha1.slice(0, 16)}`
  const romFileName = `game.${header.colorMode === "GBC" ? "gbc" : "gb"}`
  const directory = gameDirectory(id)
  if (FileManager.existsSync(directory)) FileManager.removeSync(directory)
  FileManager.createDirectorySync(directory, true)
  FileManager.writeAsDataSync(gameRomPath(id, romFileName), sourceData)

  return {
    id,
    title: match.title,
    edition,
    recompSupport: match.support,
    sha1,
    headerTitle: header.headerTitle,
    colorMode: header.colorMode,
    originalFileName: safeOriginalName(sourceName, header.colorMode),
    romFileName,
    byteLength: bytes.length,
    importedAt: new Date().toISOString(),
    playCount: 0,
  }
}

export async function importSelectedROMs(current: LibraryDocument): Promise<ImportResult | null> {
  const selected = await DocumentPicker.pickFiles({
    types: ["public.data"],
    allowsMultipleSelection: true,
    shouldShowFileExtensions: true,
  })
  if (selected.length === 0) {
    DocumentPicker.stopAcessingSecurityScopedResources()
    return null
  }

  const result: ImportResult = { imported: [], duplicateNames: [], rejected: [] }
  try {
    for (const path of selected) {
      const name = fileName(path)
      try {
        const game = importROMPath(path, { ...current, games: [...current.games, ...result.imported] })
        result.imported.push(game)
      } catch (error) {
        if (String(error).includes("DUPLICATE")) result.duplicateNames.push(name)
        else result.rejected.push({ name, reason: error instanceof Error ? error.message : String(error) })
      }
    }
  } finally {
    DocumentPicker.stopAcessingSecurityScopedResources()
  }

  if (result.imported.length > 0) {
    current.games = [...current.games, ...result.imported]
    saveLibrary(current)
  }
  return result
}

export function coverPath(game: GameRecord): string {
  if (game.customCoverFileName != null) {
    const customPath = Path.join(gameDirectory(game.id), game.customCoverFileName)
    if (FileManager.existsSync(customPath)) return customPath
  }
  return bundledCoverPath(game.edition)
}

export async function chooseCustomCover(game: GameRecord, library: LibraryDocument): Promise<boolean> {
  const selected = await DocumentPicker.pickFiles({
    types: ["public.image"],
    allowsMultipleSelection: false,
  })
  const source = selected[0]
  if (source == null) {
    DocumentPicker.stopAcessingSecurityScopedResources()
    return false
  }
  try {
    const imageData = Data.fromFile(source)
    if (imageData == null) throw new Error("The selected cover image could not be read.")
    if (imageData.size > 20 * 1024 * 1024) throw new Error("The selected cover is larger than the 20 MB safety limit.")
    const extMatch = fileName(source).match(/\.(png|jpe?g|heic|webp)$/i)
    const customName = `custom-cover.${(extMatch?.[1] ?? "jpg").toLowerCase()}`
    if (game.customCoverFileName != null) {
      const previous = Path.join(gameDirectory(game.id), game.customCoverFileName)
      if (FileManager.existsSync(previous)) FileManager.removeSync(previous)
    }
    FileManager.writeAsDataSync(Path.join(gameDirectory(game.id), customName), imageData)
    game.customCoverFileName = customName
    saveLibrary(library)
    return true
  } finally {
    DocumentPicker.stopAcessingSecurityScopedResources()
  }
}

export function resetCustomCover(game: GameRecord, library: LibraryDocument): void {
  if (game.customCoverFileName != null) {
    const path = Path.join(gameDirectory(game.id), game.customCoverFileName)
    if (FileManager.existsSync(path)) FileManager.removeSync(path)
    delete game.customCoverFileName
    saveLibrary(library)
  }
}

function copyTree(source: string, destination: string): void {
  if (!FileManager.existsSync(source)) return
  if (!FileManager.existsSync(destination)) FileManager.createDirectorySync(destination, true)
  for (const entry of FileManager.readDirectorySync(source, false)) {
    const full = entry.startsWith("/") ? entry : Path.join(source, entry)
    const name = full.replace(/\\/g, "/").split("/").pop() || ""
    if (name === "") continue
    const target = Path.join(destination, name)
    if (FileManager.isDirectorySync(full)) copyTree(full, target)
    else FileManager.copyFileSync(full, target)
  }
}

function zipFilesInDirectory(directory: string, prefix = ""): StoredZipFile[] {
  const files: StoredZipFile[] = []
  for (const entry of FileManager.readDirectorySync(directory, false)) {
    const full = entry.startsWith("/") ? entry : Path.join(directory, entry)
    const name = full.replace(/\\/g, "/").split("/").pop() || ""
    if (name === "") continue
    const relative = prefix === "" ? name : `${prefix}/${name}`
    if (FileManager.isDirectorySync(full)) files.push(...zipFilesInDirectory(full, relative))
    else files.push({ path: relative, bytes: FileManager.readAsBytesSync(full) })
  }
  return files
}

function legacySaveBase(edition: EditionKey): string | null {
  if (edition === "red") return "save.lua"
  if (edition === "blue") return "save_blue.lua"
  if (edition === "yellow") return "save_yellow.lua"
  if (edition === "gold") return "save_gold.lua"
  return null
}

function stageGameSaves(game: GameRecord, destination: string): number {
  let copied = 0
  const options = ["options.lua", "options.lua.bak", "options.lua.tmp"]
  for (const name of options) {
    const source = Path.join(SAVES_ROOT, name)
    if (FileManager.existsSync(source)) {
      FileManager.copyFileSync(source, Path.join(destination, name))
      copied += 1
    }
  }
  const versionSource = Path.join(SAVES_ROOT, "saves", game.edition)
  if (FileManager.existsSync(versionSource)) {
    copyTree(versionSource, Path.join(destination, "saves", game.edition))
    copied += 1
  }
  const legacy = legacySaveBase(game.edition)
  if (legacy != null) {
    for (const suffix of ["", ".bak", ".tmp"]) {
      const source = Path.join(SAVES_ROOT, `${legacy}${suffix}`)
      if (FileManager.existsSync(source)) {
        FileManager.copyFileSync(source, Path.join(destination, `${legacy}${suffix}`))
        copied += 1
      }
    }
  }
  return copied
}

export async function exportGameFiles(game: GameRecord): Promise<string[]> {
  const files: Array<{ data: Data; name: string }> = []
  const rom = Data.fromFile(gameRomPath(game.id, game.romFileName))
  if (rom == null) throw new Error("The imported ROM could not be found.")
  files.push({ data: rom, name: safeOriginalName(game.originalFileName, game.colorMode) })

  const exportRoot = Path.join(RUNTIME_TEMP_ROOT, `export-${game.id}`)
  const staged = Path.join(exportRoot, "Gen1Recomp Saves")
  const archiveName = `${game.title.replace(/[^a-zA-Z0-9._-]/g, "_")}-saves.zip`
  if (FileManager.existsSync(exportRoot)) FileManager.removeSync(exportRoot)
  FileManager.createDirectorySync(staged, true)
  try {
    const count = stageGameSaves(game, staged)
    if (count > 0) {
      FileManager.writeAsStringSync(Path.join(staged, "README.txt"), "Gen1Recomp save backup. Keep the directory structure when restoring. options.lua contains shared player settings.\n")
      const saveData = Data.fromUint8Array(createStoredZip(zipFilesInDirectory(staged)))
      if (saveData == null) throw new Error("The local save ZIP could not be encoded.")
      files.push({ data: saveData, name: archiveName })
    }
    return await DocumentPicker.exportFiles({ files })
  } finally {
    if (FileManager.existsSync(exportRoot)) FileManager.removeSync(exportRoot)
  }
}

export function removeGameSaves(game: GameRecord): void {
  if (!["red", "blue", "yellow", "gold"].includes(game.edition)) return
  const versionDirectory = Path.join(SAVES_ROOT, "saves", game.edition)
  if (FileManager.existsSync(versionDirectory)) FileManager.removeSync(versionDirectory)
  const legacy = legacySaveBase(game.edition)
  if (legacy != null) {
    for (const suffix of ["", ".bak", ".tmp"]) {
      const path = Path.join(SAVES_ROOT, `${legacy}${suffix}`)
      if (FileManager.existsSync(path)) FileManager.removeSync(path)
    }
  }
}

export function removeGame(game: GameRecord, library: LibraryDocument, removeSaves = false): void {
  const directory = gameDirectory(game.id)
  if (FileManager.existsSync(directory)) FileManager.removeSync(directory)
  if (removeSaves) removeGameSaves(game)
  library.games = library.games.filter(item => item.id !== game.id)
  saveLibrary(library)
}

export function recordPlayed(game: GameRecord, library: LibraryDocument): void {
  game.lastPlayedAt = new Date().toISOString()
  game.playCount = (game.playCount || 0) + 1
  saveLibrary(library)
}

export function formatByteCount(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
