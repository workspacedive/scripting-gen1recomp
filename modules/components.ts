import { Path, Script, fetch } from "scripting"
import { loadUpdateCatalog, SUITE_VERSION } from "./config"
import { createCompatibilityLayerLove, EXECUTION_LAYER_REVISION } from "./engine-patcher"
import { compareModVersions, safeModRelativePath } from "./mod-validation"
import { discardDownload, downloadVerifiedData } from "./downloads"
import {
  COMPONENTS_ROOT,
  COMPONENT_STATE_FILE,
  bundledRuntimePath,
  ensureStorage,
} from "./paths"
import { decodeUtf8, encodeUtf8, extractLocalZipEntry, readLocalZip } from "./zip"

const ENGINE_FILE = "gen1recomp-layer-active.love"
const ENGINE_CORE_FILE = "gen1recomp-core-active.love"
const LAYER_OVERRIDE_FILE = "gen1recomp-layer-override.love"
const COMPATIBILITY_PACK_FILE = "compatibility-pack.json"
// Revision 9 retains the small executable source layer plus separate byte-
// exact upstream core and adds exact-source PotatoVoxel frame-loop guards.
// Revision-8 installed core pairs are migrated locally and transactionally;
// older materialized state still cannot bypass the current capability contract.
const ENGINE_PATCH_REVISION = EXECUTION_LAYER_REVISION
const RUNTIME_JS_FILE = "love-active.js"
const RUNTIME_WASM_FILE = "love-active.wasm"
const MAX_RUNTIME_BUNDLE_BYTES = 32 * 1024 * 1024

type EngineInstall = {
  version: string
  file: string
  sourceFile: string
  patchRevision: number
  sourceSha256: string
  installedSha256: string
  installedAt: string
}

type LayerInstall = {
  version: string
  file: string
  patchRevision: number
  coreSha256: string
  sha256: string
  installedAt: string
}

type RuntimeInstall = {
  version: string
  commit: string
  jsFile: string
  wasmFile: string
  jsSha256: string
  wasmSha256: string
  installedAt: string
}

export type ComponentState = {
  schema: 1
  engine?: EngineInstall
  executionLayer?: LayerInstall
  webRuntime?: RuntimeInstall
}

export type EngineRelease = {
  version: string
  tag: string
  pageUrl: string
  assetName: string
  downloadUrl: string
  size: number
  sha256: string
}

export type RuntimeSourceStatus = {
  activeCommit: string
  latestCommit: string
  pageUrl: string
  changed: boolean
}

export type ActiveComponents = {
  engineVersion: string
  engineSource: "bundled" | "installed"
  executionLayerVersion: string
  executionLayerSource: "bundled" | "engine" | "installed"
  runtimeVersion: string
  runtimeSource: "bundled" | "installed"
  runtimeCommit: string
  compatibilityPackVersion: string
  enginePatchRevision: number
}

type CompatibilityPack = {
  version: string
  suiteMinimum: string
  upstreamVersion: string
  upstreamFile: string
  upstreamSha256: string
  upstreamBytes: number
  layerFile: string
  layerSha256: string
  overlayTargets: string[]
}

function object(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)
}

function validVersion(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64 && /^[A-Za-z0-9._+-]+$/.test(value)
}

function loadCompatibilityPack(): CompatibilityPack {
  const path = Path.join(Script.directory, "config", COMPATIBILITY_PACK_FILE)
  const root = object(JSON.parse(FileManager.readAsStringSync(path)))
  const upstream = object(root?.upstreamCore)
  const layer = object(root?.executionLayer)
  if (root?.schema !== 2 || root.id !== "gen1recomp-execution-layer" || !validVersion(root.version)
      || !validVersion(root.suiteMinimum) || root.enginePatchRevision !== ENGINE_PATCH_REVISION
      || upstream?.immutable !== true || !validVersion(upstream?.version)
      || typeof upstream?.file !== "string"
      || !/^gen1recomp-core-[A-Za-z0-9._+-]+\.love$/.test(upstream.file)
      || !validDigest(upstream.sha256) || !Number.isSafeInteger(upstream.bytes)
      || Number(upstream.bytes) <= 0 || Number(upstream.bytes) > 64 * 1024 * 1024
      || typeof layer?.file !== "string"
      || !/^gen1recomp-layer-[A-Za-z0-9._+-]+\.love$/.test(layer.file)
      || !validDigest(layer.sha256) || !validDigest(layer.coreSha256)
      || layer.coreSha256.toLowerCase() !== upstream.sha256.toLowerCase()
      || layer.precedence !== "source-layer-before-appended-core-before-save"
      || !Array.isArray(root.rules) || root.rules.length === 0) {
    throw new Error("The bundled execution-layer manifest is invalid.")
  }
  const overlayTargets = [...new Set(root.rules.map(value => object(value)?.target)
    .filter((value): value is string => typeof value === "string" && safeModRelativePath(value) === value))]
  if (overlayTargets.length === 0) throw new Error("The compatibility pack has no safe overlay targets.")
  return {
    version: root.version,
    suiteMinimum: root.suiteMinimum,
    upstreamVersion: upstream.version,
    upstreamFile: upstream.file,
    upstreamSha256: upstream.sha256.toLowerCase(),
    upstreamBytes: Number(upstream.bytes),
    layerFile: layer.file,
    layerSha256: layer.sha256.toLowerCase(),
    overlayTargets,
  }
}

function safeDate(value: unknown): string | null {
  if (typeof value !== "string") return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function parseState(): ComponentState {
  ensureStorage()
  if (!FileManager.existsSync(COMPONENT_STATE_FILE)) return { schema: 1 }
  try {
    const source = object(JSON.parse(FileManager.readAsStringSync(COMPONENT_STATE_FILE)))
    if (source?.schema !== 1) return { schema: 1 }
    const result: ComponentState = { schema: 1 }
    const engine = object(source.engine)
    const engineDate = safeDate(engine?.installedAt)
    if (engine != null && validVersion(engine.version) && engine.file === ENGINE_FILE
        && engine.sourceFile === ENGINE_CORE_FILE && engine.patchRevision === ENGINE_PATCH_REVISION
        && validDigest(engine.sourceSha256) && validDigest(engine.installedSha256) && engineDate != null
        && FileManager.existsSync(Path.join(COMPONENTS_ROOT, ENGINE_FILE))
        && FileManager.existsSync(Path.join(COMPONENTS_ROOT, ENGINE_CORE_FILE))) {
      result.engine = {
        version: engine.version,
        file: ENGINE_FILE,
        sourceFile: ENGINE_CORE_FILE,
        patchRevision: ENGINE_PATCH_REVISION,
        sourceSha256: engine.sourceSha256.toLowerCase(),
        installedSha256: engine.installedSha256.toLowerCase(),
        installedAt: engineDate,
      }
    }
    const layer = object(source.executionLayer)
    const layerDate = safeDate(layer?.installedAt)
    if (layer != null && validVersion(layer.version) && layer.file === LAYER_OVERRIDE_FILE
        && layer.patchRevision === ENGINE_PATCH_REVISION && validDigest(layer.coreSha256)
        && validDigest(layer.sha256) && layerDate != null
        && FileManager.existsSync(Path.join(COMPONENTS_ROOT, LAYER_OVERRIDE_FILE))) {
      result.executionLayer = {
        version: layer.version,
        file: LAYER_OVERRIDE_FILE,
        patchRevision: ENGINE_PATCH_REVISION,
        coreSha256: layer.coreSha256.toLowerCase(),
        sha256: layer.sha256.toLowerCase(),
        installedAt: layerDate,
      }
    }
    const runtime = object(source.webRuntime)
    const runtimeDate = safeDate(runtime?.installedAt)
    if (runtime != null && validVersion(runtime.version) && typeof runtime.commit === "string"
        && /^[a-f0-9]{40}$/i.test(runtime.commit) && runtime.jsFile === RUNTIME_JS_FILE
        && runtime.wasmFile === RUNTIME_WASM_FILE && validDigest(runtime.jsSha256)
        && validDigest(runtime.wasmSha256) && runtimeDate != null
        && FileManager.existsSync(Path.join(COMPONENTS_ROOT, RUNTIME_JS_FILE))
        && FileManager.existsSync(Path.join(COMPONENTS_ROOT, RUNTIME_WASM_FILE))) {
      result.webRuntime = {
        version: runtime.version,
        commit: runtime.commit.toLowerCase(),
        jsFile: RUNTIME_JS_FILE,
        wasmFile: RUNTIME_WASM_FILE,
        jsSha256: runtime.jsSha256.toLowerCase(),
        wasmSha256: runtime.wasmSha256.toLowerCase(),
        installedAt: runtimeDate,
      }
    }
    return result
  } catch {
    return { schema: 1 }
  }
}

function writeStateText(text: string): void {
  ensureStorage()
  const suffix = Crypto.generateSymmetricKey(128).toHexString()
  const temporary = Path.join(COMPONENTS_ROOT, `.components-${suffix}.json`)
  const backup = Path.join(COMPONENTS_ROOT, `.components-${suffix}.backup.json`)
  FileManager.writeAsStringSync(temporary, text)
  let backedUp = false
  let installed = false
  try {
    if (FileManager.existsSync(COMPONENT_STATE_FILE)) {
      FileManager.renameSync(COMPONENT_STATE_FILE, backup)
      backedUp = true
    }
    FileManager.renameSync(temporary, COMPONENT_STATE_FILE)
    installed = true
    if (backedUp && FileManager.existsSync(backup)) FileManager.removeSync(backup)
  } catch (error) {
    if (installed && FileManager.existsSync(COMPONENT_STATE_FILE)) FileManager.removeSync(COMPONENT_STATE_FILE)
    if (backedUp && FileManager.existsSync(backup)) FileManager.renameSync(backup, COMPONENT_STATE_FILE)
    throw error
  } finally {
    if (FileManager.existsSync(temporary)) FileManager.removeSync(temporary)
  }
}

function writeState(state: ComponentState): void {
  writeStateText(JSON.stringify(state, null, 2))
}

function dataAt(path: string, label: string): Data {
  const data = Data.fromFile(path)
  if (data == null || data.size === 0) throw new Error(`${label} could not be read.`)
  return data
}

function verifiedDataAt(path: string, label: string, expectedSha256: string): Data {
  const data = dataAt(path, label)
  const actual = Crypto.sha256(data).toHexString().toLowerCase()
  if (actual !== expectedSha256.toLowerCase()) {
    throw new Error(`${label} failed its pinned SHA-256 integrity check. Restore the bundled component or reinstall the verified update.`)
  }
  return data
}

async function verifiedDataAtAsync(path: string, label: string, expectedSha256: string): Promise<Data> {
  const data = await FileManager.readAsData(path)
  if (data == null || data.size === 0) throw new Error(`${label} could not be read.`)
  const actual = typeof Thread === "object" && typeof Thread.runInBackground === "function"
    ? await Thread.runInBackground(() => Crypto.sha256(data).toHexString().toLowerCase())
    : Crypto.sha256(data).toHexString().toLowerCase()
  if (actual !== expectedSha256.toLowerCase()) {
    throw new Error(`${label} failed its pinned SHA-256 integrity check. Restore the bundled component or reinstall the verified update.`)
  }
  return data
}

export function activeComponentStatus(): ActiveComponents {
  const catalog = loadUpdateCatalog()
  const state = parseState()
  const pack = loadCompatibilityPack()
  const coreSha256 = state.engine?.sourceSha256 ?? pack.upstreamSha256
  const override = state.executionLayer?.coreSha256 === coreSha256 ? state.executionLayer : undefined
  return {
    engineVersion: state.engine?.version ?? catalog.engine.bundledVersion,
    engineSource: state.engine == null ? "bundled" : "installed",
    executionLayerVersion: override?.version ?? pack.version,
    executionLayerSource: override != null ? "installed" : state.engine == null ? "bundled" : "engine",
    runtimeVersion: state.webRuntime?.version ?? catalog.webRuntime.loveVersion,
    runtimeSource: state.webRuntime == null ? "bundled" : "installed",
    runtimeCommit: state.webRuntime?.commit ?? catalog.webRuntime.bundledCommit,
    compatibilityPackVersion: pack.version,
    enginePatchRevision: ENGINE_PATCH_REVISION,
  }
}

export type ActiveEngineLayers = {
  core: Data
  layer: Data
  coreVersion: string
  coreSha256: string
  layerVersion: string
  source: "bundled" | "installed"
  layerSource: "bundled" | "engine" | "installed"
  migration?: {
    status: "upgraded" | "failed-bundled-fallback"
    detail?: string
  }
}

function bundledEngineLayers(): ActiveEngineLayers {
  const catalog = loadUpdateCatalog()
  const pack = loadCompatibilityPack()
  if (pack.upstreamVersion !== catalog.engine.bundledVersion
      || pack.layerSha256 !== catalog.engine.bundledSha256.toLowerCase()) {
    throw new Error("The execution layer does not match the update catalog.")
  }
  const core = verifiedDataAt(
    bundledRuntimePath(pack.upstreamFile),
    "The immutable bundled Gen1Recomp upstream core",
    pack.upstreamSha256,
  )
  if (core.size !== pack.upstreamBytes) throw new Error("The bundled upstream core size is invalid.")
  const layer = verifiedDataAt(
    bundledRuntimePath(pack.layerFile),
    "The bundled Gen1Recomp execution layer",
    pack.layerSha256,
  )
  return {
    core, layer, coreVersion: pack.upstreamVersion, coreSha256: pack.upstreamSha256,
    layerVersion: pack.version, source: "bundled", layerSource: "bundled",
  }
}

async function bundledEngineLayersAsync(): Promise<ActiveEngineLayers> {
  const catalog = loadUpdateCatalog()
  const pack = loadCompatibilityPack()
  if (pack.upstreamVersion !== catalog.engine.bundledVersion
      || pack.layerSha256 !== catalog.engine.bundledSha256.toLowerCase()) {
    throw new Error("The execution layer does not match the update catalog.")
  }
  const [core, layer] = await Promise.all([
    verifiedDataAtAsync(
      bundledRuntimePath(pack.upstreamFile),
      "The immutable bundled Gen1Recomp upstream core",
      pack.upstreamSha256,
    ),
    verifiedDataAtAsync(
      bundledRuntimePath(pack.layerFile),
      "The bundled Gen1Recomp execution layer",
      pack.layerSha256,
    ),
  ])
  if (core.size !== pack.upstreamBytes) throw new Error("The bundled upstream core size is invalid.")
  return {
    core, layer, coreVersion: pack.upstreamVersion, coreSha256: pack.upstreamSha256,
    layerVersion: pack.version, source: "bundled", layerSource: "bundled",
  }
}

function withInstalledLayer(base: ActiveEngineLayers, state: ComponentState): ActiveEngineLayers {
  const override = state.executionLayer
  if (override == null || override.coreSha256 !== base.coreSha256) return base
  try {
    const layer = verifiedDataAt(
      Path.join(COMPONENTS_ROOT, override.file),
      "The installed Gen1Recomp execution-layer update",
      override.sha256,
    )
    return { ...base, layer, layerVersion: override.version, layerSource: "installed" }
  } catch {
    return base
  }
}

async function withInstalledLayerAsync(
  base: ActiveEngineLayers,
  state: ComponentState,
): Promise<ActiveEngineLayers> {
  const override = state.executionLayer
  if (override == null || override.coreSha256 !== base.coreSha256) return base
  try {
    const layer = await verifiedDataAtAsync(
      Path.join(COMPONENTS_ROOT, override.file),
      "The installed Gen1Recomp execution-layer update",
      override.sha256,
    )
    return { ...base, layer, layerVersion: override.version, layerSource: "installed" }
  } catch {
    return base
  }
}

type Revision8Migration = {
  previousStateText: string
  engine: EngineInstall
}

function revision8MigrationCandidate(): Revision8Migration | null {
  if (ENGINE_PATCH_REVISION !== 9 || !FileManager.existsSync(COMPONENT_STATE_FILE)) return null
  try {
    const previousStateText = FileManager.readAsStringSync(COMPONENT_STATE_FILE)
    const state = object(JSON.parse(previousStateText))
    const engine = object(state?.engine)
    const installedAt = safeDate(engine?.installedAt)
    if (state?.schema !== 1 || engine == null || engine.patchRevision !== 8
        || !validVersion(engine.version) || engine.file !== ENGINE_FILE
        || engine.sourceFile !== ENGINE_CORE_FILE || !validDigest(engine.sourceSha256)
        || !validDigest(engine.installedSha256) || installedAt == null
        || !FileManager.existsSync(Path.join(COMPONENTS_ROOT, ENGINE_FILE))
        || !FileManager.existsSync(Path.join(COMPONENTS_ROOT, ENGINE_CORE_FILE))) {
      return null
    }
    return {
      previousStateText,
      engine: {
        version: engine.version,
        file: ENGINE_FILE,
        sourceFile: ENGINE_CORE_FILE,
        patchRevision: 8,
        sourceSha256: engine.sourceSha256.toLowerCase(),
        installedSha256: engine.installedSha256.toLowerCase(),
        installedAt,
      },
    }
  } catch {
    return null
  }
}

async function migrateRevision8InstalledLayer(): Promise<boolean> {
  const candidate = revision8MigrationCandidate()
  if (candidate == null) return false
  const pack = loadCompatibilityPack()
  const corePath = Path.join(COMPONENTS_ROOT, candidate.engine.sourceFile)
  const core = await verifiedDataAtAsync(
    corePath,
    "The immutable revision-8 installed Gen1Recomp upstream core",
    candidate.engine.sourceSha256,
  )
  const bit = await FileManager.readAsData(bundledRuntimePath("patches/bit.lua"))
  const sourceBytes = core.toUint8Array()
  const bitBytes = bit?.toUint8Array()
  if (sourceBytes == null || bit == null || bit.size === 0 || bitBytes == null) {
    throw new Error("The revision-9 execution layer could not read its verified generation inputs.")
  }
  const contract = {
    layerVersion: pack.version,
    suiteMinimum: pack.suiteMinimum,
    coreVersion: candidate.engine.version,
    coreSha256: candidate.engine.sourceSha256,
  }
  const layerBytes = typeof Thread === "object" && typeof Thread.runInBackground === "function"
    ? await Thread.runInBackground(() => createCompatibilityLayerLove(sourceBytes, bitBytes, contract))
    : createCompatibilityLayerLove(sourceBytes, bitBytes, contract)
  const layer = Data.fromUint8Array(layerBytes)
  if (layer == null) throw new Error("The migrated revision-9 execution layer could not be encoded.")
  const layerSha256 = Crypto.sha256(layer).toHexString().toLowerCase()
  const destination = Path.join(COMPONENTS_ROOT, ENGINE_FILE)
  const staging = Path.join(COMPONENTS_ROOT, `.layer-migration-${layerSha256.slice(0, 16)}.love`)
  const backup = Path.join(COMPONENTS_ROOT, ".layer-migration-revision8.backup.love")
  let backedUp = false
  let installed = false
  let stateCommitted = false
  await FileManager.writeAsData(staging, layer)
  try {
    if (await FileManager.exists(backup)) await FileManager.remove(backup)
    await FileManager.rename(destination, backup)
    backedUp = true
    await FileManager.rename(staging, destination)
    installed = true

    const state = parseState() // preserves any independently valid Web runtime
    state.engine = {
      version: candidate.engine.version,
      file: ENGINE_FILE,
      sourceFile: ENGINE_CORE_FILE,
      patchRevision: ENGINE_PATCH_REVISION,
      sourceSha256: candidate.engine.sourceSha256,
      installedSha256: layerSha256,
      installedAt: candidate.engine.installedAt,
    }
    // A revision-8 independent override cannot satisfy revision 9. The exact
    // immutable core remains selected and receives the newly generated layer.
    delete state.executionLayer
    writeState(state)
    stateCommitted = true
    await verifiedDataAtAsync(destination, "The migrated revision-9 Gen1Recomp execution layer", layerSha256)
    const activated = parseState()
    if (activated.engine?.patchRevision !== ENGINE_PATCH_REVISION
        || activated.engine.sourceSha256 !== candidate.engine.sourceSha256
        || activated.engine.installedSha256 !== layerSha256) {
      throw new Error("The migrated execution-layer state failed post-commit verification.")
    }
    if (await FileManager.exists(backup)) await FileManager.remove(backup)
    const obsoleteOverride = Path.join(COMPONENTS_ROOT, LAYER_OVERRIDE_FILE)
    if (await FileManager.exists(obsoleteOverride)) await FileManager.remove(obsoleteOverride)
    return true
  } catch (error) {
    try {
      if (stateCommitted) writeStateText(candidate.previousStateText)
      if (installed && await FileManager.exists(destination)) await FileManager.remove(destination)
      if (backedUp && await FileManager.exists(backup)) await FileManager.rename(backup, destination)
    } catch (rollbackError) {
      throw new Error(`Execution-layer migration failed and rollback was incomplete: ${String(error)}; rollback: ${String(rollbackError)}`)
    }
    throw error
  } finally {
    if (await FileManager.exists(staging)) await FileManager.remove(staging)
  }
}

export function activeEngineLayers(): ActiveEngineLayers {
  const state = parseState()
  const pack = loadCompatibilityPack()
  let base: ActiveEngineLayers
  if (state.engine == null) {
    base = bundledEngineLayers()
  } else {
    try {
      const core = verifiedDataAt(
        Path.join(COMPONENTS_ROOT, state.engine.sourceFile),
        "The immutable installed Gen1Recomp upstream core",
        state.engine.sourceSha256,
      )
      const layer = verifiedDataAt(
        Path.join(COMPONENTS_ROOT, state.engine.file),
        "The installed Gen1Recomp execution layer",
        state.engine.installedSha256,
      )
      base = {
        core, layer, coreVersion: state.engine.version, coreSha256: state.engine.sourceSha256,
        layerVersion: pack.version, source: "installed", layerSource: "engine",
      }
    } catch {
      // Chrome-style safe absence/corruption behavior: an untrusted or incomplete
      // installed pair never partially activates; use the immutable bundled pair.
      base = bundledEngineLayers()
    }
  }
  return withInstalledLayer(base, state)
}

export async function activeEngineLayersAsync(): Promise<ActiveEngineLayers> {
  let migration: ActiveEngineLayers["migration"]
  try {
    if (await migrateRevision8InstalledLayer()) migration = { status: "upgraded" }
  } catch (error) {
    migration = {
      status: "failed-bundled-fallback",
      detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }
  }
  const state = parseState()
  const pack = loadCompatibilityPack()
  let base: ActiveEngineLayers
  if (state.engine == null) {
    base = await bundledEngineLayersAsync()
  } else {
    try {
      const [core, layer] = await Promise.all([
        verifiedDataAtAsync(
          Path.join(COMPONENTS_ROOT, state.engine.sourceFile),
          "The immutable installed Gen1Recomp upstream core",
          state.engine.sourceSha256,
        ),
        verifiedDataAtAsync(
          Path.join(COMPONENTS_ROOT, state.engine.file),
          "The installed Gen1Recomp execution layer",
          state.engine.installedSha256,
        ),
      ])
      base = {
        core, layer, coreVersion: state.engine.version, coreSha256: state.engine.sourceSha256,
        layerVersion: pack.version, source: "installed", layerSource: "engine",
      }
    } catch {
      base = await bundledEngineLayersAsync()
    }
  }
  const selected = await withInstalledLayerAsync(base, state)
  return migration == null ? selected : { ...selected, migration }
}

// Retained for source compatibility with older callers; the executable source
// is now the small layer, never a reconstructed patched core.
export function activeEngineData(): Data {
  return activeEngineLayers().layer
}

export async function activeEngineDataAsync(): Promise<Data> {
  return (await activeEngineLayersAsync()).layer
}

export function activeWebRuntime(): { js: Data; wasm: Data } {
  const catalog = loadUpdateCatalog()
  const state = parseState()
  if (state.webRuntime == null) {
    return {
      js: verifiedDataAt(bundledRuntimePath("love.js"), "The bundled LÖVE JavaScript runtime", catalog.webRuntime.files["love.js"]),
      wasm: verifiedDataAt(bundledRuntimePath("love.wasm"), "The bundled LÖVE WebAssembly runtime", catalog.webRuntime.files["love.wasm"]),
    }
  }
  return {
    js: verifiedDataAt(Path.join(COMPONENTS_ROOT, state.webRuntime.jsFile), "The installed LÖVE JavaScript runtime", state.webRuntime.jsSha256),
    wasm: verifiedDataAt(Path.join(COMPONENTS_ROOT, state.webRuntime.wasmFile), "The installed LÖVE WebAssembly runtime", state.webRuntime.wasmSha256),
  }
}

export async function activeWebRuntimeAsync(): Promise<{ js: Data; wasm: Data }> {
  const catalog = loadUpdateCatalog()
  const state = parseState()
  if (state.webRuntime == null) {
    const [js, wasm] = await Promise.all([
      verifiedDataAtAsync(bundledRuntimePath("love.js"), "The bundled LÖVE JavaScript runtime", catalog.webRuntime.files["love.js"]),
      verifiedDataAtAsync(bundledRuntimePath("love.wasm"), "The bundled LÖVE WebAssembly runtime", catalog.webRuntime.files["love.wasm"]),
    ])
    return { js, wasm }
  }
  const [js, wasm] = await Promise.all([
    verifiedDataAtAsync(Path.join(COMPONENTS_ROOT, state.webRuntime.jsFile), "The installed LÖVE JavaScript runtime", state.webRuntime.jsSha256),
    verifiedDataAtAsync(Path.join(COMPONENTS_ROOT, state.webRuntime.wasmFile), "The installed LÖVE WebAssembly runtime", state.webRuntime.wasmSha256),
  ])
  return { js, wasm }
}

function trustedReleaseUrl(url: string, repo: string, kind: "tag" | "download"): boolean {
  const prefix = kind === "tag"
    ? `https://github.com/${repo}/releases/tag/`
    : `https://github.com/${repo}/releases/download/`
  return url.toLowerCase().startsWith(prefix.toLowerCase())
}

function digestValue(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.toLowerCase().replace(/^sha256:/, "")
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null
}

export async function checkEngineRelease(): Promise<EngineRelease> {
  const catalog = loadUpdateCatalog()
  const repo = catalog.engine.repo
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    timeout: 30,
    debugLabel: "Gen1Recomp engine update check",
  })
  if (!response.ok) throw new Error(`Engine update check failed with HTTP ${response.status}.`)
  const release = object(await response.json())
  if (release == null || typeof release.tag_name !== "string" || typeof release.html_url !== "string"
      || !trustedReleaseUrl(release.html_url, repo, "tag") || !Array.isArray(release.assets)) {
    throw new Error("GitHub returned incomplete engine release metadata.")
  }
  const assets = release.assets.map(object).filter((asset): asset is Record<string, unknown> => asset != null)
  const suffix = catalog.engine.assetSuffix.toLowerCase()
  const candidates = assets.filter(asset => typeof asset.name === "string"
    && asset.name.toLowerCase().endsWith(suffix)
    && typeof asset.browser_download_url === "string"
    && trustedReleaseUrl(asset.browser_download_url, repo, "download")
    && typeof asset.size === "number" && Number.isSafeInteger(asset.size)
    && asset.size > 0 && asset.size <= catalog.engine.maximumBytes
    && digestValue(asset.digest) != null)
  if (candidates.length !== 1) throw new Error("The latest engine release has no unambiguous verified .love asset.")
  const asset = candidates[0]
  return {
    version: release.tag_name.replace(/^v/i, ""),
    tag: release.tag_name,
    pageUrl: release.html_url,
    assetName: asset.name as string,
    downloadUrl: asset.browser_download_url as string,
    size: asset.size as number,
    sha256: digestValue(asset.digest) as string,
  }
}

export function engineUpdateAvailable(release: EngineRelease): boolean {
  return compareModVersions(activeComponentStatus().engineVersion, release.version) < 0
}

export async function installEngineRelease(release: EngineRelease): Promise<ActiveComponents> {
  const catalog = loadUpdateCatalog()
  if (!validVersion(release.version)
      || typeof release.assetName !== "string"
      || !release.assetName.toLowerCase().endsWith(catalog.engine.assetSuffix.toLowerCase())
      || typeof release.pageUrl !== "string" || typeof release.downloadUrl !== "string"
      || !trustedReleaseUrl(release.pageUrl, catalog.engine.repo, "tag")
      || !trustedReleaseUrl(release.downloadUrl, catalog.engine.repo, "download")
      || !Number.isSafeInteger(release.size) || release.size <= 0 || release.size > catalog.engine.maximumBytes
      || !validDigest(release.sha256)) {
    throw new Error("The selected engine release is not trusted by the update catalog.")
  }
  const downloadId = `component:engine:${release.version.replace(/[^A-Za-z0-9._+-]/g, "_")}`
  const source = await downloadVerifiedData({
    id: downloadId,
    kind: "component",
    title: `Gen1Recomp ${release.version}`,
    url: release.downloadUrl,
    expectedSize: release.size,
    expectedSha256: release.sha256,
    debugLabel: `Gen1Recomp engine download ${release.version}`,
  })
  if (source.size !== release.size) throw new Error("The engine download size does not match GitHub metadata.")
  const sourceDigest = Crypto.sha256(source).toHexString().toLowerCase()
  if (sourceDigest !== release.sha256) throw new Error("The engine download SHA-256 does not match GitHub metadata.")
  if (compareModVersions(activeComponentStatus().engineVersion, release.version) >= 0) {
    throw new Error("Engine component versions must increase monotonically.")
  }
  const sourceBytes = source.toUint8Array()
  const bitBytes = dataAt(Path.join(Script.directory, "runtime", "patches", "bit.lua"), "The Lua bit compatibility module").toUint8Array()
  if (sourceBytes == null || bitBytes == null) throw new Error("The engine update could not be converted to bytes.")
  const pack = loadCompatibilityPack()
  const layerContract = {
    layerVersion: pack.version,
    suiteMinimum: pack.suiteMinimum,
    coreVersion: release.version,
    coreSha256: sourceDigest,
  }
  const layerBytes = typeof Thread === "object" && typeof Thread.runInBackground === "function"
    ? await Thread.runInBackground(() => createCompatibilityLayerLove(sourceBytes, bitBytes, layerContract))
    : createCompatibilityLayerLove(sourceBytes, bitBytes, layerContract)
  const layer = Data.fromUint8Array(layerBytes)
  if (layer == null) throw new Error("The execution layer could not be encoded.")
  const installedDigest = Crypto.sha256(layer).toHexString().toLowerCase()
  const destination = Path.join(COMPONENTS_ROOT, ENGINE_FILE)
  const coreDestination = Path.join(COMPONENTS_ROOT, ENGINE_CORE_FILE)
  const staging = Path.join(COMPONENTS_ROOT, `.layer-${installedDigest.slice(0, 16)}.love`)
  const coreStaging = Path.join(COMPONENTS_ROOT, `.engine-core-${sourceDigest.slice(0, 16)}.love`)
  const backup = Path.join(COMPONENTS_ROOT, ".layer-backup.love")
  const coreBackup = Path.join(COMPONENTS_ROOT, ".engine-core-backup.love")
  await FileManager.writeAsData(staging, layer)
  await FileManager.writeAsData(coreStaging, source)
  const state = parseState()
  const previous = state.engine
  const previousLayer = state.executionLayer
  let backedUp = false
  let coreBackedUp = false
  let installed = false
  let coreInstalled = false
  try {
    if (await FileManager.exists(backup)) await FileManager.remove(backup)
    if (await FileManager.exists(coreBackup)) await FileManager.remove(coreBackup)
    if (await FileManager.exists(destination)) {
      await FileManager.rename(destination, backup)
      backedUp = true
    }
    if (await FileManager.exists(coreDestination)) {
      await FileManager.rename(coreDestination, coreBackup)
      coreBackedUp = true
    }
    await FileManager.rename(staging, destination)
    installed = true
    await FileManager.rename(coreStaging, coreDestination)
    coreInstalled = true
    state.engine = {
      version: release.version,
      file: ENGINE_FILE,
      sourceFile: ENGINE_CORE_FILE,
      patchRevision: ENGINE_PATCH_REVISION,
      sourceSha256: sourceDigest,
      installedSha256: installedDigest,
      installedAt: new Date().toISOString(),
    }
    // A layer override is bound to one exact core digest. A core update must
    // never inherit executable overlay bytes generated for the previous core.
    delete state.executionLayer
    writeState(state)
    const result = activeComponentStatus()
    try {
      if (await FileManager.exists(backup)) await FileManager.remove(backup)
      if (await FileManager.exists(coreBackup)) await FileManager.remove(coreBackup)
      const obsoleteLayer = Path.join(COMPONENTS_ROOT, LAYER_OVERRIDE_FILE)
      if (await FileManager.exists(obsoleteLayer)) await FileManager.remove(obsoleteLayer)
    } catch {
      // Stale backups or an obsolete core-bound layer are harmless after commit.
    }
    try { discardDownload(downloadId) } catch {
      // A stale verified manager entry is harmless after transactional commit.
    }
    return result
  } catch (error) {
    try {
      if (installed && await FileManager.exists(destination)) await FileManager.remove(destination)
      if (coreInstalled && await FileManager.exists(coreDestination)) await FileManager.remove(coreDestination)
      if (backedUp && await FileManager.exists(backup)) await FileManager.rename(backup, destination)
      if (coreBackedUp && await FileManager.exists(coreBackup)) await FileManager.rename(coreBackup, coreDestination)
      state.engine = previous
      state.executionLayer = previousLayer
      writeState(state)
    } catch (rollbackError) {
      throw new Error(`Engine installation failed and rollback was incomplete: ${String(error)}; rollback: ${String(rollbackError)}`)
    }
    throw error
  } finally {
    if (await FileManager.exists(staging)) await FileManager.remove(staging)
    if (await FileManager.exists(coreStaging)) await FileManager.remove(coreStaging)
  }
}

export function resetEngineComponent(): ActiveComponents {
  const state = parseState()
  delete state.engine
  delete state.executionLayer
  writeState(state)
  for (const name of [ENGINE_FILE, ENGINE_CORE_FILE, LAYER_OVERRIDE_FILE]) {
    const path = Path.join(COMPONENTS_ROOT, name)
    if (FileManager.existsSync(path)) FileManager.removeSync(path)
  }
  return activeComponentStatus()
}

const MAX_EXECUTION_LAYER_BYTES = 4 * 1024 * 1024
const MAX_EXECUTION_LAYER_FILES = 64
const REQUIRED_LAYER_FILES = [
  "conf.lua",
  "main.lua",
  "compat/core-conf.lua",
  "compat/core-main.lua",
  "src/mods/Loader.lua",
  "src/core/SaveData.lua",
  "src/mods/AssetTransform.lua",
  "src/debug/SwitchDiagnostics.lua",
  "src/import/CacheFs.lua",
  "src/core/TouchControls.lua",
  "src/core/Music.lua",
  "src/update/Boot.lua",
  "bit.lua",
] as const

/**
 * Installs a user-selected, separately versioned execution-layer update.
 *
 * The local file is an explicit trust action (there is no bundled signing key
 * or remote layer feed). Activation still requires a complete deterministic
 * manifest, exact per-file/whole-archive hashes, the current capability
 * revision, a newer layer version, and an exact match to the selected core.
 */
export async function installExecutionLayer(path: string): Promise<ActiveComponents> {
  const selected = await activeEngineLayersAsync()
  const source = await FileManager.readAsData(path)
  if (source.size <= 0 || source.size > MAX_EXECUTION_LAYER_BYTES) {
    throw new Error("The execution layer must be a non-empty archive no larger than 4 MiB.")
  }
  const sourceBytes = source.toUint8Array()
  if (sourceBytes == null) throw new Error("The execution layer could not be converted to bytes.")
  const entries = readLocalZip(sourceBytes)
  if (entries.length === 0 || entries.length > MAX_EXECUTION_LAYER_FILES) {
    throw new Error("The execution layer has an invalid file count.")
  }
  const extracted = new Map<string, Uint8Array>()
  let totalBytes = 0
  for (const entry of entries) {
    if (entry.type !== "file") throw new Error("Execution layers may contain regular files only.")
    const pathName = safeModRelativePath(entry.path)
    if (pathName == null || pathName !== entry.path || extracted.has(pathName) || pathName.length > 240) {
      throw new Error(`Unsafe or duplicate execution-layer path: ${entry.path}`)
    }
    const bytes = extractLocalZipEntry(sourceBytes, entry)
    totalBytes += bytes.length
    if (totalBytes > MAX_EXECUTION_LAYER_BYTES) {
      throw new Error("The expanded execution layer exceeds 4 MiB.")
    }
    extracted.set(pathName, bytes)
  }
  const manifestBytes = extracted.get("layer-manifest.json")
  if (manifestBytes == null || manifestBytes.length > 128 * 1024) {
    throw new Error("The execution layer has no bounded layer-manifest.json.")
  }
  let decoded: unknown
  try {
    decoded = JSON.parse(decodeUtf8(manifestBytes))
  } catch {
    throw new Error("The execution-layer manifest is invalid JSON.")
  }
  const manifest = object(decoded)
  const layer = object(manifest?.layer)
  const core = object(manifest?.core)
  const build = object(manifest?.build)
  if (manifest?.schema !== 1 || layer?.id !== "gen1recomp-execution-layer"
      || !validVersion(layer.version) || layer.revision !== ENGINE_PATCH_REVISION
      || !validVersion(layer.suiteMinimum)
      || compareModVersions(String(layer.suiteMinimum), SUITE_VERSION) > 0
      || core?.version !== selected.coreVersion || core.sha256 !== selected.coreSha256
      || core.bytes !== selected.core.size || core.immutable !== true
      || build?.deterministic !== true || build.output !== "source-layer-only") {
    throw new Error("The execution layer is incompatible with this suite or selected immutable core.")
  }
  if (compareModVersions(selected.layerVersion, String(layer.version)) >= 0) {
    throw new Error("Execution-layer versions must increase monotonically.")
  }
  const requiredTargets = loadCompatibilityPack().overlayTargets
  const targets = new Set(Array.isArray(manifest.overlayTargets)
    ? manifest.overlayTargets.filter((value): value is string => typeof value === "string")
    : [])
  for (const target of requiredTargets) {
    if (!targets.has(target)) throw new Error(`The execution layer omits protected target ${target}.`)
  }
  const declaredFiles = Array.isArray(manifest.files) ? manifest.files : []
  if (declaredFiles.length !== extracted.size - 1) {
    throw new Error("The execution-layer file manifest is incomplete.")
  }
  const declaredPaths = new Set<string>()
  for (const value of declaredFiles) {
    const file = object(value)
    if (file == null || typeof file.path !== "string" || !validDigest(file.sha256)
        || !Number.isSafeInteger(file.bytes) || Number(file.bytes) < 0
        || file.path === "layer-manifest.json" || declaredPaths.has(file.path)) {
      throw new Error("The execution layer has an invalid file-manifest record.")
    }
    const bytes = extracted.get(file.path)
    if (bytes == null || bytes.length !== file.bytes) {
      throw new Error(`Execution-layer size mismatch: ${file.path}`)
    }
    const data = Data.fromUint8Array(bytes)
    if (data == null || Crypto.sha256(data).toHexString().toLowerCase() !== String(file.sha256).toLowerCase()) {
      throw new Error(`Execution-layer digest mismatch: ${file.path}`)
    }
    declaredPaths.add(file.path)
  }
  for (const file of REQUIRED_LAYER_FILES) {
    if (!declaredPaths.has(file)) throw new Error(`The execution layer omits required broker ${file}.`)
  }
  for (const file of extracted.keys()) {
    if (file !== "layer-manifest.json" && !declaredPaths.has(file)) {
      throw new Error(`The execution layer contains undeclared executable bytes: ${file}`)
    }
  }

  const sha256 = Crypto.sha256(source).toHexString().toLowerCase()
  const destination = Path.join(COMPONENTS_ROOT, LAYER_OVERRIDE_FILE)
  const staging = Path.join(COMPONENTS_ROOT, `.layer-override-${sha256.slice(0, 16)}.love`)
  const backup = Path.join(COMPONENTS_ROOT, ".layer-override-backup.love")
  const state = parseState()
  const previous = state.executionLayer
  let backedUp = false
  let installed = false
  await FileManager.writeAsData(staging, source)
  try {
    if (await FileManager.exists(backup)) await FileManager.remove(backup)
    if (await FileManager.exists(destination)) {
      await FileManager.rename(destination, backup)
      backedUp = true
    }
    await FileManager.rename(staging, destination)
    installed = true
    state.executionLayer = {
      version: String(layer.version),
      file: LAYER_OVERRIDE_FILE,
      patchRevision: ENGINE_PATCH_REVISION,
      coreSha256: selected.coreSha256,
      sha256,
      installedAt: new Date().toISOString(),
    }
    writeState(state)
    const activated = await activeEngineLayersAsync()
    if (activated.layerSource !== "installed" || activated.layerVersion !== layer.version
        || Crypto.sha256(activated.layer).toHexString().toLowerCase() !== sha256) {
      throw new Error("The execution layer did not pass post-install activation verification.")
    }
    try { if (await FileManager.exists(backup)) await FileManager.remove(backup) } catch {
      // A stale backup is harmless after archive, hash, state, and activation commit.
    }
    return activeComponentStatus()
  } catch (error) {
    try {
      if (installed && await FileManager.exists(destination)) await FileManager.remove(destination)
      if (backedUp && await FileManager.exists(backup)) await FileManager.rename(backup, destination)
      state.executionLayer = previous
      writeState(state)
    } catch (rollbackError) {
      throw new Error(`Execution-layer installation failed and rollback was incomplete: ${String(error)}; rollback: ${String(rollbackError)}`)
    }
    throw error
  } finally {
    if (await FileManager.exists(staging)) await FileManager.remove(staging)
  }
}

export function resetExecutionLayer(): ActiveComponents {
  const state = parseState()
  delete state.executionLayer
  writeState(state)
  const path = Path.join(COMPONENTS_ROOT, LAYER_OVERRIDE_FILE)
  if (FileManager.existsSync(path)) FileManager.removeSync(path)
  return activeComponentStatus()
}

export async function checkRuntimeSource(): Promise<RuntimeSourceStatus> {
  const catalog = loadUpdateCatalog()
  const { repo, branch } = catalog.webRuntime
  const response = await fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`, {
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    timeout: 30,
    debugLabel: "LÖVE Web runtime source check",
  })
  if (!response.ok) throw new Error(`Runtime source check failed with HTTP ${response.status}.`)
  const value = object(await response.json())
  if (value == null || typeof value.sha !== "string" || !/^[a-f0-9]{40}$/i.test(value.sha)
      || typeof value.html_url !== "string"
      || !value.html_url.toLowerCase().startsWith(`https://github.com/${repo.toLowerCase()}/commit/`)) {
    throw new Error("GitHub returned untrusted runtime source metadata.")
  }
  const active = activeComponentStatus()
  return {
    activeCommit: active.runtimeCommit,
    latestCommit: value.sha.toLowerCase(),
    pageUrl: value.html_url,
    changed: active.runtimeCommit !== value.sha.toLowerCase(),
  }
}

function patchRuntimeJs(bytes: Uint8Array): Uint8Array {
  let source = decodeUtf8(bytes)
  if (source.includes("SharedArrayBuffer") || source.includes("PThread") || source.includes("pthread-main.js")) {
    throw new Error("The runtime bundle is threaded and cannot run in the serverless WKWebView.")
  }
  if (!source.includes('Module["FS"]=FS')) {
    const anchor = 'Module["getMemory"]=getMemory;'
    const index = source.indexOf(anchor)
    if (index < 0 || source.indexOf(anchor, index + anchor.length) >= 0) {
      throw new Error("The runtime JavaScript has no compatible filesystem export point.")
    }
    source = source.slice(0, index) + 'Module["FS"]=FS;' + source.slice(index)
  }
  return encodeUtf8(source)
}

export function installRuntimeBundle(path: string): ActiveComponents {
  const archiveData = dataAt(path, "The selected runtime bundle")
  if (archiveData.size > MAX_RUNTIME_BUNDLE_BYTES) throw new Error("The runtime bundle exceeds 32 MiB.")
  const archiveBytes = archiveData.toUint8Array()
  if (archiveBytes == null) throw new Error("The runtime bundle could not be converted to bytes.")
  const entries = readLocalZip(archiveBytes)
  const files = new Map<string, Uint8Array>()
  let total = 0
  for (const entry of entries) {
    if (entry.type !== "file") throw new Error("Runtime bundles may contain files only.")
    const normalized = safeModRelativePath(entry.path)
    if (normalized == null || normalized.includes("/")) throw new Error(`Unsafe runtime bundle path: ${entry.path}`)
    if (!["runtime-manifest.json", "love.js", "love.wasm", "LICENSE.txt"].includes(normalized)) {
      throw new Error(`Unexpected runtime bundle file: ${normalized}`)
    }
    if (files.has(normalized)) throw new Error(`Duplicate runtime bundle file: ${normalized}`)
    const output = extractLocalZipEntry(archiveBytes, entry)
    total += output.length
    if (total > MAX_RUNTIME_BUNDLE_BYTES) throw new Error("The expanded runtime bundle exceeds 32 MiB.")
    files.set(normalized, output)
  }
  const manifestBytes = files.get("runtime-manifest.json")
  const jsInput = files.get("love.js")
  const wasmBytes = files.get("love.wasm")
  if (manifestBytes == null || jsInput == null || wasmBytes == null) throw new Error("The runtime bundle is incomplete.")
  const manifest = object(JSON.parse(decodeUtf8(manifestBytes)))
  const hashes = object(manifest?.files)
  if (manifest?.schema !== 1 || manifest.id !== "love-web" || !validVersion(manifest.version)
      || typeof manifest.commit !== "string" || !/^[a-f0-9]{40}$/i.test(manifest.commit)
      || hashes == null || !validDigest(hashes["love.js"]) || !validDigest(hashes["love.wasm"])) {
    throw new Error("The runtime bundle manifest is invalid.")
  }
  const jsInputData = Data.fromUint8Array(jsInput)
  const wasmData = Data.fromUint8Array(wasmBytes)
  if (jsInputData == null || wasmData == null) throw new Error("The runtime bundle files could not be hashed.")
  if (Crypto.sha256(jsInputData).toHexString().toLowerCase() !== String(hashes["love.js"]).toLowerCase()
      || Crypto.sha256(wasmData).toHexString().toLowerCase() !== String(hashes["love.wasm"]).toLowerCase()) {
    throw new Error("The runtime bundle hashes do not match its manifest.")
  }
  if (wasmBytes.length < 8 || wasmBytes[0] !== 0 || wasmBytes[1] !== 0x61 || wasmBytes[2] !== 0x73
      || wasmBytes[3] !== 0x6d || wasmBytes[4] !== 1 || wasmBytes[5] !== 0 || wasmBytes[6] !== 0 || wasmBytes[7] !== 0) {
    throw new Error("The runtime bundle has invalid WebAssembly magic/version bytes.")
  }
  const jsBytes = patchRuntimeJs(jsInput)
  const jsData = Data.fromUint8Array(jsBytes)
  if (jsData == null) throw new Error("The runtime JavaScript could not be encoded.")
  const jsDigest = Crypto.sha256(jsData).toHexString().toLowerCase()
  const wasmDigest = Crypto.sha256(wasmData).toHexString().toLowerCase()
  const jsDestination = Path.join(COMPONENTS_ROOT, RUNTIME_JS_FILE)
  const wasmDestination = Path.join(COMPONENTS_ROOT, RUNTIME_WASM_FILE)
  const suffix = Crypto.generateSymmetricKey(128).toHexString().slice(0, 12)
  const jsStaging = Path.join(COMPONENTS_ROOT, `.runtime-${suffix}.js`)
  const wasmStaging = Path.join(COMPONENTS_ROOT, `.runtime-${suffix}.wasm`)
  FileManager.writeAsDataSync(jsStaging, jsData)
  FileManager.writeAsDataSync(wasmStaging, wasmData)
  const state = parseState()
  const previous = state.webRuntime
  const jsBackup = Path.join(COMPONENTS_ROOT, `.runtime-${suffix}.backup.js`)
  const wasmBackup = Path.join(COMPONENTS_ROOT, `.runtime-${suffix}.backup.wasm`)
  let jsBackedUp = false
  let wasmBackedUp = false
  let jsInstalled = false
  let wasmInstalled = false
  try {
    if (FileManager.existsSync(jsDestination)) {
      FileManager.renameSync(jsDestination, jsBackup)
      jsBackedUp = true
    }
    if (FileManager.existsSync(wasmDestination)) {
      FileManager.renameSync(wasmDestination, wasmBackup)
      wasmBackedUp = true
    }
    FileManager.renameSync(jsStaging, jsDestination)
    jsInstalled = true
    FileManager.renameSync(wasmStaging, wasmDestination)
    wasmInstalled = true
    state.webRuntime = {
      version: manifest.version as string,
      commit: (manifest.commit as string).toLowerCase(),
      jsFile: RUNTIME_JS_FILE,
      wasmFile: RUNTIME_WASM_FILE,
      jsSha256: jsDigest,
      wasmSha256: wasmDigest,
      installedAt: new Date().toISOString(),
    }
    writeState(state)
    const result = activeComponentStatus()
    try {
      if (jsBackedUp && FileManager.existsSync(jsBackup)) FileManager.removeSync(jsBackup)
      if (wasmBackedUp && FileManager.existsSync(wasmBackup)) FileManager.removeSync(wasmBackup)
    } catch {
      // A stale backup is harmless; never roll back a fully committed runtime for cleanup alone.
    }
    return result
  } catch (error) {
    try {
      if (jsInstalled && FileManager.existsSync(jsDestination)) FileManager.removeSync(jsDestination)
      if (wasmInstalled && FileManager.existsSync(wasmDestination)) FileManager.removeSync(wasmDestination)
      if (jsBackedUp && FileManager.existsSync(jsBackup)) FileManager.renameSync(jsBackup, jsDestination)
      if (wasmBackedUp && FileManager.existsSync(wasmBackup)) FileManager.renameSync(wasmBackup, wasmDestination)
      state.webRuntime = previous
      writeState(state)
    } catch (rollbackError) {
      throw new Error(`Runtime installation failed and rollback was incomplete: ${String(error)}; rollback: ${String(rollbackError)}`)
    }
    throw error
  } finally {
    if (FileManager.existsSync(jsStaging)) FileManager.removeSync(jsStaging)
    if (FileManager.existsSync(wasmStaging)) FileManager.removeSync(wasmStaging)
  }
}

export function resetWebRuntime(): ActiveComponents {
  const state = parseState()
  delete state.webRuntime
  writeState(state)
  for (const name of [RUNTIME_JS_FILE, RUNTIME_WASM_FILE]) {
    const path = Path.join(COMPONENTS_ROOT, name)
    if (FileManager.existsSync(path)) FileManager.removeSync(path)
  }
  return activeComponentStatus()
}
