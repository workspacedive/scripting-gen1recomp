import { Path, fetch } from "scripting"
import type { InstalledMod, ModLibraryDocument, ModRelease, ReleaseAsset } from "./types"
import { loadUpdateCatalog } from "./config"
import { discardDownload, downloadVerifiedData } from "./downloads"
import {
  forgetNativeModOptionMetadata,
  parseDeclarativeOptionSchema,
  reconcileRuntimeModOptionMetadata,
  sanitizeModOptionSchema,
} from "./mod-options"
import { MOD_IMPORT_LIMITS } from "./mod-limits"
import { createRepackedZipFromArchive, extractLocalZipEntry, readLocalZip } from "./zip"
import type { ArchiveRepackedZipFile } from "./zip"
import type { LocalZipEntry } from "./zip"
import {
  MOD_LIBRARY_BACKUP_FILE,
  MOD_LIBRARY_FILE,
  MOD_STATE_MIRROR_FILE,
  MODS_ROOT,
  SAVES_ROOT,
  ensureStorage,
} from "./paths"
import {
  compareModVersions,
  forbiddenModPayload,
  parseGitHubReleaseReference,
  parseGitHubRepo,
  parseModManifest,
  safeModRelativePath,
} from "./mod-validation"

export const DRAMATIC_SHAPE_REPO = loadUpdateCatalog().featuredMods
  .find(mod => mod.id === "DRAMATIC_SHAPE")?.repo ?? ""

const MAX_ARCHIVE_BYTES = MOD_IMPORT_LIMITS.archiveBytes
const MAX_MOD_FILE_BYTES = MOD_IMPORT_LIMITS.fileBytes
const MAX_MOD_TOTAL_BYTES = MOD_IMPORT_LIMITS.totalBytes
const MAX_MOD_FILES_PER_ARCHIVE = MOD_IMPORT_LIMITS.filesPerArchive
const MAX_MOD_ARCHIVE_ENTRIES = MOD_IMPORT_LIMITS.entriesPerArchive
const MAX_INSTALLED_MOD_FILES = MOD_IMPORT_LIMITS.installedFiles
const MAX_MANIFEST_BYTES = MOD_IMPORT_LIMITS.manifestBytes
const NATIVE_MOD_STATE_NAME = "native_mod_state.json"

type GitHubAsset = {
  name?: unknown
  browser_download_url?: unknown
  size?: unknown
  digest?: unknown
}

type GitHubRelease = {
  tag_name?: unknown
  html_url?: unknown
  published_at?: unknown
  assets?: unknown
}

export type PreparedMod = {
  directory: string
  record: InstalledMod
}

export type ModPreparationProgress = {
  stage: "scanning" | "verifying" | "packing"
  completed: number
  total: number
}

type ModPreparationOptions = {
  sourceRepo?: string
  onProgress?: (progress: ModPreparationProgress) => void
}

export type ModPackageFile = {
  filename: string
  data: Data
}

function emptyLibrary(): ModLibraryDocument {
  return { schemaVersion: 1, mods: [] }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function safeDate(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function safeStringList(value: unknown, maximum = 64): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 160)
    .slice(0, maximum)
}

function sanitizeInstalled(value: unknown): InstalledMod | null {
  const source = asObject(value)
  if (source == null) return null
  try {
    const manifest = parseModManifest({
      id: source.id,
      name: source.name,
      version: source.version,
      entry: source.entry,
      api: source.api,
      description: source.description,
      category: source.category,
      game_version: source.gameVersion,
      permissions: source.permissions,
      dependencies: source.dependencies,
      conflicts: source.conflicts,
      github: source.sourceRepo,
      options_schema: source.optionsSchemaPath,
    })
    if (typeof source.archiveSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(source.archiveSha256)) return null
    const byteLength = Number(source.byteLength)
    const fileCount = Number(source.fileCount)
    if (!Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > MAX_MOD_TOTAL_BYTES
        || !Number.isSafeInteger(fileCount) || fileCount < 1 || fileCount > MAX_MOD_FILES_PER_ARCHIVE) return null
    const storage = source.storage === "archive" ? "archive" : "directory"
    const packageSha256 = typeof source.packageSha256 === "string" && /^[a-f0-9]{64}$/i.test(source.packageSha256)
      ? source.packageSha256.toLowerCase() : undefined
    if (storage === "archive" && packageSha256 == null) return null
    const now = new Date().toISOString()
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      entry: manifest.entry,
      api: manifest.api,
      enabled: source.enabled !== false,
      category: manifest.category,
      gameVersion: manifest.gameVersion,
      permissions: manifest.permissions,
      dependencies: manifest.dependencies,
      conflicts: manifest.conflicts,
      sourceRepo: manifest.github,
      optionsSchemaPath: manifest.optionsSchema,
      optionSchema: sanitizeModOptionSchema(source.optionSchema, manifest.version) ?? undefined,
      optionsScannedVersion: typeof source.optionsScannedVersion === "string" && source.optionsScannedVersion === manifest.version
        ? source.optionsScannedVersion : undefined,
      archiveSha256: source.archiveSha256.toLowerCase(),
      storage,
      packageSha256,
      byteLength,
      fileCount,
      installedAt: safeDate(source.installedAt, now),
      updatedAt: safeDate(source.updatedAt, now),
    }
  } catch {
    return null
  }
}

function parseLibrary(path: string): ModLibraryDocument | null {
  if (!FileManager.existsSync(path)) return null
  try {
    const source = asObject(JSON.parse(FileManager.readAsStringSync(path)))
    if (source == null || source.schemaVersion !== 1 || !Array.isArray(source.mods)) return null
    const mods: InstalledMod[] = []
    const ids = new Set<string>()
    for (const item of source.mods) {
      const mod = sanitizeInstalled(item)
      if (mod != null && !ids.has(mod.id)) {
        ids.add(mod.id)
        mods.push(mod)
      }
    }
    return { schemaVersion: 1, mods }
  } catch {
    return null
  }
}

function nativeStateObject(library: ModLibraryDocument): { schema: 1; mods: Record<string, boolean> } {
  const mods: Record<string, boolean> = Object.create(null) as Record<string, boolean>
  for (const mod of library.mods) mods[mod.id] = mod.enabled
  return { schema: 1, mods }
}

function writeNativeState(library: ModLibraryDocument): void {
  if (!FileManager.existsSync(SAVES_ROOT)) FileManager.createDirectorySync(SAVES_ROOT, true)
  FileManager.writeAsStringSync(MOD_STATE_MIRROR_FILE, JSON.stringify(nativeStateObject(library)))
}

export function saveModLibrary(library: ModLibraryDocument): void {
  ensureStorage()
  if (FileManager.existsSync(MOD_LIBRARY_FILE)) {
    if (FileManager.existsSync(MOD_LIBRARY_BACKUP_FILE)) FileManager.removeSync(MOD_LIBRARY_BACKUP_FILE)
    FileManager.copyFileSync(MOD_LIBRARY_FILE, MOD_LIBRARY_BACKUP_FILE)
  }
  FileManager.writeAsStringSync(MOD_LIBRARY_FILE, JSON.stringify(library, null, 2))
  writeNativeState(library)
}

function reconcileRuntimeState(library: ModLibraryDocument): boolean {
  const data = Data.fromFile(MOD_STATE_MIRROR_FILE)
  if (data == null || data.size === 0 || data.size > MAX_MANIFEST_BYTES) return false
  try {
    const state = asObject(JSON.parse(data.toRawString("utf-8") || ""))
    const values = asObject(state?.mods)
    if (state?.schema !== 1 || values == null) return false
    let changed = false
    for (const mod of library.mods) {
      const enabled = values[mod.id]
      if (typeof enabled === "boolean" && enabled !== mod.enabled) {
        mod.enabled = enabled
        changed = true
      }
    }
    return changed
  } catch {
    return false
  }
}

export function loadModLibrary(): ModLibraryDocument {
  ensureStorage()
  let library = parseLibrary(MOD_LIBRARY_FILE)
  if (library == null) {
    library = parseLibrary(MOD_LIBRARY_BACKUP_FILE) ?? emptyLibrary()
    if (library.mods.length > 0) FileManager.writeAsStringSync(MOD_LIBRARY_FILE, JSON.stringify(library, null, 2))
  }
  const runtimeStateChanged = reconcileRuntimeState(library)
  const optionMetadataChanged = reconcileRuntimeModOptionMetadata(library)
  if (runtimeStateChanged || optionMetadataChanged) saveModLibrary(library)
  else writeNativeState(library)
  return library
}

function ignoredMetadataPath(path: string): boolean {
  const lower = path.toLowerCase()
  return lower === ".ds_store" || lower.startsWith("__macosx/") || lower.includes("/__macosx/")
}

function manifestPrefix(entries: Array<{ original: LocalZipEntry; normalized: string }>): string {
  const candidates = entries.filter(item => {
    if (item.original.type !== "file") return false
    const parts = item.normalized.split("/")
    return parts[parts.length - 1] === "manifest.json" && parts.length <= 2
  })
  if (candidates.length !== 1) {
    throw new Error("The mod ZIP must contain exactly one root manifest.json, optionally inside one wrapper directory.")
  }
  const path = candidates[0].normalized
  const prefix = path.slice(0, path.length - "manifest.json".length)
  if (prefix !== "" && prefix.slice(0, -1).includes("/")) {
    throw new Error("manifest.json may be at the ZIP root or inside one wrapper directory.")
  }
  const wrapperDirectory = prefix === "" ? "" : prefix.slice(0, -1)
  for (const item of entries) {
    if (ignoredMetadataPath(item.normalized)) continue
    const isWrapperDirectory = item.original.type === "directory" && item.normalized === wrapperDirectory
    if (prefix !== "" && !isWrapperDirectory && !item.normalized.startsWith(prefix)) {
      throw new Error("The mod ZIP mixes files outside its manifest directory.")
    }
  }
  return prefix
}

function stagingDirectory(): string {
  return Path.join(MODS_ROOT, `.staging-${Crypto.generateSymmetricKey(128).toHexString().toLowerCase()}`)
}

const ZIP_SCAN_BATCH_ENTRIES = 256
const ZIP_VERIFY_BATCH_ENTRIES = 16
const ZIP_VERIFY_BATCH_BYTES = 8 * 1024 * 1024

async function runCpuTask<T>(execute: () => T): Promise<T> {
  if (typeof Thread === "object" && typeof Thread.runInBackground === "function") {
    return Thread.runInBackground(execute)
  }
  // Compatibility path for an older Scripting host: correctness is retained,
  // but the caller's cooperative progress boundaries cannot move CPU off-main.
  return Promise.resolve().then(execute)
}

export async function prepareModArchive(
  sourcePath: string,
  options: ModPreparationOptions | string = {},
): Promise<PreparedMod> {
  ensureStorage()
  const sourceRepo = typeof options === "string" ? options : options.sourceRepo
  const onProgress = typeof options === "string" ? undefined : options.onProgress
  const archiveData = await FileManager.readAsData(sourcePath)
  if (archiveData == null) throw new Error("The selected mod ZIP could not be read.")
  if (archiveData.size <= 0 || archiveData.size > MAX_ARCHIVE_BYTES) throw new Error("The mod ZIP exceeds the 64 MiB compressed-size limit.")

  const archiveBytes = archiveData.toUint8Array()
  if (archiveBytes == null) throw new Error("The selected mod ZIP could not be decoded as bytes.")
  const rawEntries = await runCpuTask(() => readLocalZip(archiveBytes))
  if (rawEntries.length === 0 || rawEntries.length > MAX_MOD_ARCHIVE_ENTRIES) {
    throw new Error(`The mod ZIP must contain 1–${MAX_MOD_ARCHIVE_ENTRIES} entries.`)
  }

  const entries: Array<{ original: LocalZipEntry; normalized: string }> = []
  const paths = new Set<string>()
  let total = 0
  let files = 0
  onProgress?.({ stage: "scanning", completed: 0, total: rawEntries.length })
  for (let start = 0; start < rawEntries.length; start += ZIP_SCAN_BATCH_ENTRIES) {
    const batch = rawEntries.slice(start, Math.min(rawEntries.length, start + ZIP_SCAN_BATCH_ENTRIES))
    const scanned = await runCpuTask(() => batch.map(entry => {
      if (entry.type !== "file" && entry.type !== "directory") {
        throw new Error("Symbolic links are not allowed; unknown archive entry types are also rejected.")
      }
      const normalized = safeModRelativePath(entry.path)
      if (normalized == null) throw new Error(`Unsafe ZIP path: ${entry.path}`)
      let fileBytes = 0
      let fileCount = 0
      if (entry.type === "file") {
        if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > MAX_MOD_FILE_BYTES) {
          throw new Error(`A mod file exceeds the 32 MiB limit: ${normalized}`)
        }
        fileBytes = entry.uncompressedSize
        fileCount = 1
        if (forbiddenModPayload(normalized)) throw new Error(`ROM, save, state, and IPA payloads are forbidden in mods: ${normalized}`)
        if (entry.uncompressedSize > 1024 * 1024 && entry.compressedSize > 0
            && entry.uncompressedSize / entry.compressedSize > 500) {
          throw new Error(`Suspicious ZIP compression ratio: ${normalized}`)
        }
      }
      return { original: entry, normalized, fileBytes, fileCount }
    }))
    for (const item of scanned) {
      const collisionKey = item.normalized.toLowerCase()
      if (paths.has(collisionKey)) throw new Error(`Duplicate or case-colliding ZIP path: ${item.normalized}`)
      paths.add(collisionKey)
      total += item.fileBytes
      files += item.fileCount
      if (total > MAX_MOD_TOTAL_BYTES || files > MAX_MOD_FILES_PER_ARCHIVE) {
        throw new Error(`The extracted mod exceeds the 128 MiB / ${MAX_MOD_FILES_PER_ARCHIVE}-file limit.`)
      }
      entries.push({ original: item.original, normalized: item.normalized })
    }
    onProgress?.({ stage: "scanning", completed: Math.min(rawEntries.length, start + batch.length), total: rawEntries.length })
  }

  const prefix = manifestPrefix(entries)
  const packedEntries = entries.filter(item => item.original.type === "file" && !ignoredMetadataPath(item.normalized))
  const packedFiles: ArchiveRepackedZipFile[] = packedEntries.map(item => {
    const relative = prefix === "" ? item.normalized : item.normalized.slice(prefix.length)
    if (relative === "" || safeModRelativePath(relative) == null) {
      throw new Error(`The normalized mod path is invalid: ${item.normalized}`)
    }
    return {
      path: relative,
      method: item.original.method,
      dataOffset: item.original.dataOffset,
      compressedSize: item.original.compressedSize,
      uncompressedSize: item.original.uncompressedSize,
      crc32: item.original.crc32,
    }
  })

  let manifestBytes: Uint8Array | null = null
  let verified = 0
  onProgress?.({ stage: "verifying", completed: 0, total: packedEntries.length })
  for (let start = 0; start < packedEntries.length;) {
    let end = start
    let batchBytes = 0
    while (end < packedEntries.length && end - start < ZIP_VERIFY_BATCH_ENTRIES) {
      const nextBytes = packedEntries[end].original.uncompressedSize
      if (end > start && batchBytes + nextBytes > ZIP_VERIFY_BATCH_BYTES) break
      batchBytes += nextBytes
      end += 1
    }
    const batch = packedEntries.slice(start, end)
    const verifiedBatch = await runCpuTask(() => {
      let manifest: Uint8Array | null = null
      for (const item of batch) {
        const extracted = extractLocalZipEntry(archiveBytes, item.original)
        const relative = prefix === "" ? item.normalized : item.normalized.slice(prefix.length)
        if (relative === "manifest.json") manifest = extracted
      }
      return { count: batch.length, manifest }
    })
    if (verifiedBatch.manifest != null) manifestBytes = verifiedBatch.manifest
    verified += verifiedBatch.count
    onProgress?.({ stage: "verifying", completed: verified, total: packedEntries.length })
    start = end
  }

  if (manifestBytes == null || manifestBytes.length === 0 || manifestBytes.length > MAX_MANIFEST_BYTES) {
    throw new Error("manifest.json is missing, empty, or too large.")
  }
  const manifestData = Data.fromUint8Array(manifestBytes)
  const manifest = parseModManifest(JSON.parse(manifestData?.toRawString("utf-8") || ""))
  if (!packedFiles.some(file => file.path === manifest.entry)) {
    throw new Error(`The declared mod entry is missing or has different letter case: ${manifest.entry}`)
  }

  let optionSchema: InstalledMod["optionSchema"]
  if (manifest.optionsSchema != null) {
    const schemaItem = packedEntries.find(item => {
      const relative = prefix === "" ? item.normalized : item.normalized.slice(prefix.length)
      return relative === manifest.optionsSchema
    })
    if (schemaItem == null) {
      throw new Error(`The declared options_schema is missing or has different letter case: ${manifest.optionsSchema}`)
    }
    if (schemaItem.original.uncompressedSize <= MAX_MANIFEST_BYTES) {
      try {
        const schemaBytes = await runCpuTask(() => extractLocalZipEntry(archiveBytes, schemaItem.original))
        const schemaData = Data.fromUint8Array(schemaBytes)
        const schemaSource = schemaData?.toRawString("utf-8")
        if (schemaSource != null) optionSchema = parseDeclarativeOptionSchema(schemaSource, manifest.version)
      } catch {
        // The dashboard never executes schema Lua. Non-literal schemas are
        // captured as normalized data by genuine Gen1Recomp after a launch.
      }
    }
  }

  const staging = stagingDirectory()
  await FileManager.createDirectory(staging, true)
  try {
    onProgress?.({ stage: "packing", completed: 0, total: packedFiles.length })
    const packageBytes = await runCpuTask(() => createRepackedZipFromArchive(archiveBytes, packedFiles))
    if (packageBytes.length <= 0 || packageBytes.length > MAX_ARCHIVE_BYTES) {
      throw new Error("The normalized mod package exceeds the 64 MiB compressed-size limit.")
    }
    const packageData = Data.fromUint8Array(packageBytes)
    if (packageData == null) throw new Error("The normalized mod package could not be encoded.")
    await FileManager.writeAsData(Path.join(staging, "package.zip"), packageData)
    onProgress?.({ stage: "packing", completed: packedFiles.length, total: packedFiles.length })

    const now = new Date().toISOString()
    const repo = parseGitHubRepo(sourceRepo) ?? manifest.github
    return {
      directory: staging,
      record: {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        entry: manifest.entry,
        api: manifest.api,
        enabled: true,
        category: manifest.category,
        gameVersion: manifest.gameVersion,
        permissions: manifest.permissions,
        dependencies: manifest.dependencies,
        conflicts: manifest.conflicts,
        sourceRepo: repo,
        optionsSchemaPath: manifest.optionsSchema,
        optionSchema,
        optionsScannedVersion: optionSchema == null ? undefined : manifest.version,
        archiveSha256: Crypto.sha256(archiveData).toHexString().toLowerCase(),
        storage: "archive",
        packageSha256: Crypto.sha256(packageData).toHexString().toLowerCase(),
        byteLength: total,
        fileCount: files,
        installedAt: now,
        updatedAt: now,
      },
    }
  } catch (error) {
    if (FileManager.existsSync(staging)) FileManager.removeSync(staging)
    throw error
  }
}
export function discardPreparedMod(prepared: PreparedMod): void {
  if (FileManager.existsSync(prepared.directory)) FileManager.removeSync(prepared.directory)
}

export function installPreparedMod(prepared: PreparedMod, expectedId?: string): ModLibraryDocument {
  const library = loadModLibrary()
  if (expectedId != null && prepared.record.id !== expectedId) {
    discardPreparedMod(prepared)
    throw new Error(`The update contains mod ${prepared.record.id}, not ${expectedId}.`)
  }
  const index = library.mods.findIndex(mod => mod.id === prepared.record.id)
  const previous = index >= 0 ? library.mods[index] : null
  const otherMods = library.mods.filter(mod => mod.id !== prepared.record.id)
  const nextTotalBytes = otherMods.reduce((sum, mod) => sum + mod.byteLength, 0) + prepared.record.byteLength
  const nextFileCount = otherMods.reduce((sum, mod) => sum + mod.fileCount, 0) + prepared.record.fileCount
  if (nextTotalBytes > MAX_MOD_TOTAL_BYTES || nextFileCount > MAX_INSTALLED_MOD_FILES) {
    discardPreparedMod(prepared)
    throw new Error(`Installed mods would exceed the 128 MiB / ${MAX_INSTALLED_MOD_FILES}-file runtime limit.`)
  }
  if (previous != null) {
    prepared.record.enabled = previous.enabled
    prepared.record.installedAt = previous.installedAt
  }
  const destination = Path.join(MODS_ROOT, prepared.record.id)
  const backup = Path.join(MODS_ROOT, `.backup-${prepared.record.id}`)
  if (FileManager.existsSync(backup)) FileManager.removeSync(backup)
  try {
    if (FileManager.existsSync(destination)) FileManager.renameSync(destination, backup)
    FileManager.renameSync(prepared.directory, destination)
    if (index >= 0) library.mods[index] = prepared.record
    else library.mods.push(prepared.record)
    library.mods.sort((left, right) => left.name.localeCompare(right.name))
    saveModLibrary(library)
    if (FileManager.existsSync(backup)) FileManager.removeSync(backup)
    return library
  } catch (error) {
    if (FileManager.existsSync(destination)) FileManager.removeSync(destination)
    if (FileManager.existsSync(backup)) FileManager.renameSync(backup, destination)
    if (FileManager.existsSync(prepared.directory)) FileManager.removeSync(prepared.directory)
    throw error
  }
}

export function setModEnabled(id: string, enabled: boolean): ModLibraryDocument {
  const library = loadModLibrary()
  const mod = library.mods.find(item => item.id === id)
  if (mod == null) throw new Error("The selected mod is no longer installed.")
  mod.enabled = enabled
  saveModLibrary(library)
  return library
}

export function removeInstalledMod(id: string): ModLibraryDocument {
  const library = loadModLibrary()
  const index = library.mods.findIndex(mod => mod.id === id)
  if (index < 0) return library
  const destination = Path.join(MODS_ROOT, id)
  const trash = Path.join(MODS_ROOT, `.removed-${id}`)
  if (FileManager.existsSync(trash)) FileManager.removeSync(trash)
  try {
    if (FileManager.existsSync(destination)) FileManager.renameSync(destination, trash)
    forgetNativeModOptionMetadata(id)
    library.mods.splice(index, 1)
    saveModLibrary(library)
    if (FileManager.existsSync(trash)) FileManager.removeSync(trash)
    return library
  } catch (error) {
    if (FileManager.existsSync(trash)) FileManager.renameSync(trash, destination)
    throw error
  }
}

function trustedReleaseURL(url: string, repo: string, section: "tag" | "download"): boolean {
  const prefix = section === "tag"
    ? `https://github.com/${repo}/releases/tag/`
    : `https://github.com/${repo}/releases/download/`
  return url.toLowerCase().startsWith(prefix.toLowerCase())
}

function releaseAsset(value: GitHubAsset, repo: string): ReleaseAsset | null {
  if (typeof value.name !== "string" || typeof value.browser_download_url !== "string" || typeof value.size !== "number") return null
  if (!value.name.toLowerCase().endsWith(".zip") || !trustedReleaseURL(value.browser_download_url, repo, "download")) return null
  if (!Number.isFinite(value.size) || value.size <= 0 || value.size > MAX_ARCHIVE_BYTES) return null
  return {
    name: value.name,
    downloadUrl: value.browser_download_url,
    size: value.size,
    digest: typeof value.digest === "string" ? value.digest : undefined,
  }
}

function parsedModRelease(value: GitHubRelease, repo: string, expectedId?: string): ModRelease {
  if (typeof value.tag_name !== "string" || typeof value.html_url !== "string" || !trustedReleaseURL(value.html_url, repo, "tag")) {
    throw new Error("GitHub returned incomplete or untrusted mod release metadata.")
  }
  const assets = Array.isArray(value.assets)
    ? value.assets.map(asset => releaseAsset(asset as GitHubAsset, repo)).filter((asset): asset is ReleaseAsset => asset != null)
    : []
  if (assets.length === 0) throw new Error("The release has no bounded installable ZIP asset.")
  let asset: ReleaseAsset | undefined
  if (expectedId != null) {
    const needle = expectedId.replace(/[^a-z0-9]/gi, "").toLowerCase()
    asset = assets.find(item => item.name.replace(/[^a-z0-9]/gi, "").toLowerCase().includes(needle))
  }
  if (asset == null && assets.length === 1) asset = assets[0]
  if (asset == null) throw new Error("The release contains multiple ZIPs and no unambiguous mod package.")
  return {
    repo,
    version: value.tag_name.replace(/^v/i, ""),
    tag: value.tag_name,
    pageUrl: value.html_url,
    publishedAt: typeof value.published_at === "string" ? value.published_at : undefined,
    asset,
  }
}

async function releaseFromEndpoint(repo: string, endpoint: string, expectedId?: string): Promise<ModRelease> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/${endpoint}`, {
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    timeout: 30,
    debugLabel: `Mod release check: ${repo}`,
  })
  if (!response.ok) throw new Error(`GitHub mod release check failed with HTTP ${response.status}.`)
  return parsedModRelease(await response.json() as GitHubRelease, repo, expectedId)
}

export async function checkModRelease(repoValue: string, expectedId?: string): Promise<ModRelease> {
  const repo = parseGitHubRepo(repoValue)
  if (repo == null) throw new Error("This mod has no valid GitHub update source.")
  return releaseFromEndpoint(repo, "latest", expectedId)
}

export async function checkModReleaseURL(value: string): Promise<ModRelease> {
  const reference = parseGitHubReleaseReference(value)
  if (reference == null) throw new Error("Enter a valid GitHub repository or exact release URL.")
  return releaseFromEndpoint(
    reference.repo,
    reference.tag == null ? "latest" : `tags/${encodeURIComponent(reference.tag)}`,
  )
}

function expectedSha256(digest?: string): string | null {
  if (digest == null) return null
  const value = digest.toLowerCase().replace(/^sha256:/, "")
  return /^[a-f0-9]{64}$/.test(value) ? value : null
}

export async function downloadAndPrepareMod(
  release: ModRelease,
  onProgress?: (progress: ModPreparationProgress) => void,
): Promise<PreparedMod> {
  const expected = expectedSha256(release.asset.digest)
  if (expected == null) throw new Error("GitHub did not publish a usable SHA-256 digest for this mod ZIP.")
  const downloadId = `mod:${expected}`
  const data = await downloadVerifiedData({
    id: downloadId,
    kind: "mod",
    title: `${release.asset.name} · v${release.version}`,
    url: release.asset.downloadUrl,
    expectedSize: release.asset.size,
    expectedSha256: expected,
    debugLabel: `Mod download: ${release.repo}@${release.version}`,
  })
  if (data.size !== release.asset.size) throw new Error("The downloaded mod size does not match GitHub metadata.")
  const actual = Crypto.sha256(data).toHexString().toLowerCase()
  if (actual !== expected) throw new Error("The downloaded mod SHA-256 does not match GitHub metadata.")
  const temporary = Path.join(FileManager.temporaryDirectory, `gen1recomp-mod-${actual.slice(0, 16)}.zip`)
  await FileManager.writeAsData(temporary, data)
  try {
    return await prepareModArchive(temporary, { sourceRepo: release.repo, onProgress })
  } finally {
    if (await FileManager.exists(temporary)) await FileManager.remove(temporary)
    try { discardDownload(downloadId) } catch {
      // A stale verified manager entry cannot enter the prepared transaction.
    }
  }
}

export function updateAvailable(installed: InstalledMod, release: ModRelease): boolean {
  return compareModVersions(installed.version, release.version) < 0
}

function fullEntryPath(directory: string, entry: string): string {
  return entry.startsWith("/") ? entry : Path.join(directory, entry)
}

export async function modPackageFiles(): Promise<ModPackageFile[]> {
  const library = loadModLibrary()
  // Only enabled payload bytes enter the temporary LÖVE/Wasm package. Keep
  // every installed id in native_mod_state.json below so a disabled mod can
  // be re-enabled natively and will be selected on the next launch without
  // reinstalling or losing its explicit enablement state.
  const activeMods = library.mods.filter(mod => mod.enabled)
  const logicalBytes = activeMods.reduce((sum, mod) => sum + mod.byteLength, 0)
  const logicalFiles = activeMods.reduce((sum, mod) => sum + mod.fileCount, 0)
  if (logicalBytes > MAX_MOD_TOTAL_BYTES || logicalFiles > MAX_INSTALLED_MOD_FILES) {
    throw new Error(`Enabled mods exceed the 128 MiB / ${MAX_INSTALLED_MOD_FILES}-file runtime limit.`)
  }

  const result: ModPackageFile[] = []
  let directoryBytes = 0
  let directoryFiles = 0
  const addDirectory = async (mod: InstalledMod, directory: string, prefix: string): Promise<void> => {
    for (const entry of await FileManager.readDirectory(directory, false)) {
      const full = fullEntryPath(directory, entry)
      const name = full.replace(/\\/g, "/").split("/").pop() || ""
      if (name === "") continue
      const relative = prefix === "" ? name : `${prefix}/${name}`
      if (safeModRelativePath(relative) == null) throw new Error(`Installed mod contains an unsafe path: ${mod.id}/${relative}`)
      if (await FileManager.isDirectory(full)) {
        await addDirectory(mod, full, relative)
      } else {
        const data = await FileManager.readAsData(full)
        if (data == null) throw new Error(`An installed mod file could not be read: ${mod.id}/${relative}`)
        if (data.size > MAX_MOD_FILE_BYTES) throw new Error(`An installed mod file exceeds 32 MiB: ${mod.id}/${relative}`)
        directoryBytes += data.size
        directoryFiles += 1
        if (directoryBytes > MAX_MOD_TOTAL_BYTES || directoryFiles > MAX_INSTALLED_MOD_FILES) {
          throw new Error(`Expanded enabled mods exceed the 128 MiB / ${MAX_INSTALLED_MOD_FILES}-file runtime limit.`)
        }
        result.push({
          filename: `/home/web_user/love/pokemon-love2d/mods/${mod.id}/${relative}`,
          data,
        })
      }
    }
  }
  for (const mod of activeMods) {
    const directory = Path.join(MODS_ROOT, mod.id)
    if (!await FileManager.exists(directory) || !await FileManager.isDirectory(directory)) {
      throw new Error(`Installed mod data is missing: ${mod.name}`)
    }
    if (mod.storage === "archive") {
      const packagePath = Path.join(directory, "package.zip")
      const data = await FileManager.readAsData(packagePath)
      if (data == null || data.size <= 0 || data.size > MAX_ARCHIVE_BYTES) {
        throw new Error(`Installed packed mod data is missing or invalid: ${mod.name}`)
      }
      const digest = await runCpuTask(() => Crypto.sha256(data).toHexString().toLowerCase())
      if (digest !== mod.packageSha256) throw new Error(`Installed packed mod integrity check failed: ${mod.name}`)
      const bytes = data.toUint8Array()
      if (bytes == null) throw new Error(`Installed packed mod could not be decoded: ${mod.name}`)
      const entries = await runCpuTask(() => readLocalZip(bytes))
      const files = entries.filter(entry => entry.type === "file")
      if (entries.length === 0 || entries.length > MAX_MOD_ARCHIVE_ENTRIES || files.length > mod.fileCount
          || files.reduce((sum, entry) => sum + entry.uncompressedSize, 0) > mod.byteLength
          || entries.some(entry => entry.type !== "file" || safeModRelativePath(entry.path) == null || forbiddenModPayload(entry.path))) {
        throw new Error(`Installed packed mod structure changed unexpectedly: ${mod.name}`)
      }
      if (!files.some(entry => entry.path === "manifest.json") || !files.some(entry => entry.path === mod.entry)) {
        throw new Error(`Installed packed mod manifest or entry is missing: ${mod.name}`)
      }
      result.push({
        filename: `/home/web_user/love/pokemon-love2d/native-mod-packages/${mod.id}.zip`,
        data,
      })
    } else {
      await addDirectory(mod, directory, "")
    }
  }
  const state = Data.fromRawString(JSON.stringify(nativeStateObject(library)), "utf-8")
  if (state == null) throw new Error("The native mod state could not be encoded.")
  result.push({ filename: `/home/web_user/love/pokemon-love2d/${NATIVE_MOD_STATE_NAME}`, data: state })
  return result
}

