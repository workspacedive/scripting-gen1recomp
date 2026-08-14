import { Path, Script } from "scripting"
import { parseGitHubRepo } from "./mod-validation"

export const SUITE_VERSION = "3.6.0"

export type PerformanceProfile = "balanced" | "efficient" | "quality"
export type ModPresetValue = string | number | boolean

export type UpdateCatalog = {
  schema: 1
  engine: {
    id: string
    name: string
    repo: string
    bundledVersion: string
    bundledSha256: string
    assetSuffix: string
    maximumBytes: number
  }
  webRuntime: {
    id: string
    name: string
    loveVersion: string
    repo: string
    branch: string
    bundledCommit: string
    files: Record<string, string>
  }
  featuredMods: Array<{
    id: string
    name: string
    repo: string
    presets: Partial<Record<Exclude<PerformanceProfile, "quality">, Record<string, ModPresetValue>>>
  }>
}

function object(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function text(value: unknown, label: string, pattern: RegExp, maximum = 120): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || !pattern.test(value)) {
    throw new Error(`Invalid update catalog ${label}.`)
  }
  return value
}

function digest(value: unknown, label: string): string {
  return text(value, label, /^[a-f0-9]{64}$/i, 64).toLowerCase()
}

function preset(value: unknown): Record<string, ModPresetValue> {
  const source = object(value)
  if (source == null || Object.keys(source).length > 32) throw new Error("Invalid update catalog mod preset.")
  const result: Record<string, ModPresetValue> = Object.create(null) as Record<string, ModPresetValue>
  for (const [key, item] of Object.entries(source)) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)
        || (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean")
        || (typeof item === "string" && item.length > 100)
        || (typeof item === "number" && !Number.isFinite(item))) {
      throw new Error("Invalid update catalog mod preset value.")
    }
    result[key] = item
  }
  return result
}

let cached: UpdateCatalog | null = null

export function loadUpdateCatalog(): UpdateCatalog {
  if (cached != null) return cached
  const path = Path.join(Script.directory, "config", "catalog.json")
  const source = object(JSON.parse(FileManager.readAsStringSync(path)))
  const engine = object(source?.engine)
  const runtime = object(source?.webRuntime)
  if (source?.schema !== 1 || engine == null || runtime == null || !Array.isArray(source.featuredMods)) {
    throw new Error("The bundled update catalog is malformed.")
  }
  const engineRepo = parseGitHubRepo(engine.repo)
  const runtimeRepo = parseGitHubRepo(runtime.repo)
  if (engineRepo == null || runtimeRepo == null) throw new Error("The update catalog contains an invalid repository.")
  const filesSource = object(runtime.files)
  if (filesSource == null || Object.keys(filesSource).sort().join(",") !== "love.js,love.wasm") {
    throw new Error("The update catalog runtime file set is invalid.")
  }
  const featuredMods = source.featuredMods.map((value): UpdateCatalog["featuredMods"][number] => {
    const item = object(value)
    const repo = parseGitHubRepo(item?.repo)
    const presets = object(item?.presets)
    if (item == null || repo == null || presets == null) throw new Error("Invalid featured mod catalog entry.")
    return {
      id: text(item.id, "featured mod id", /^[A-Za-z0-9_-]+$/, 64),
      name: text(item.name, "featured mod name", /^[^\u0000-\u001f\u007f]+$/, 100),
      repo,
      presets: {
        balanced: preset(presets.balanced),
        efficient: preset(presets.efficient),
      },
    }
  })
  cached = {
    schema: 1,
    engine: {
      id: text(engine.id, "engine id", /^[a-z0-9-]+$/, 40),
      name: text(engine.name, "engine name", /^[^\u0000-\u001f\u007f]+$/, 80),
      repo: engineRepo,
      bundledVersion: text(engine.bundledVersion, "engine version", /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/, 48),
      bundledSha256: digest(engine.bundledSha256, "bundled engine hash"),
      assetSuffix: text(engine.assetSuffix, "engine asset suffix", /^\.[a-z0-9]+$/, 12),
      maximumBytes: Number(engine.maximumBytes),
    },
    webRuntime: {
      id: text(runtime.id, "runtime id", /^[a-z0-9-]+$/, 40),
      name: text(runtime.name, "runtime name", /^[^\u0000-\u001f\u007f]+$/, 80),
      loveVersion: text(runtime.loveVersion, "LÖVE version", /^\d+\.\d+$/, 20),
      repo: runtimeRepo,
      branch: text(runtime.branch, "runtime branch", /^[A-Za-z0-9._/-]+$/, 100),
      bundledCommit: text(runtime.bundledCommit, "runtime commit", /^[a-f0-9]{40}$/i, 40).toLowerCase(),
      files: {
        "love.js": digest(filesSource["love.js"], "love.js hash"),
        "love.wasm": digest(filesSource["love.wasm"], "love.wasm hash"),
      },
    },
    featuredMods,
  }
  if (!Number.isSafeInteger(cached.engine.maximumBytes)
      || cached.engine.maximumBytes < 1024 || cached.engine.maximumBytes > 64 * 1024 * 1024) {
    cached = null
    throw new Error("The update catalog engine size limit is invalid.")
  }
  return cached
}

export function managedModOptionKeys(): Record<string, string[]> {
  const result: Record<string, string[]> = Object.create(null) as Record<string, string[]>
  for (const mod of loadUpdateCatalog().featuredMods) {
    const keys = new Set<string>()
    for (const values of Object.values(mod.presets)) {
      if (values != null) Object.keys(values).forEach(key => keys.add(key))
    }
    result[mod.id] = [...keys].sort()
  }
  return result
}

export function modOverridesForProfile(profile: PerformanceProfile): Record<string, Record<string, ModPresetValue>> {
  const result: Record<string, Record<string, ModPresetValue>> = Object.create(null) as Record<string, Record<string, ModPresetValue>>
  if (profile === "quality") return result
  for (const mod of loadUpdateCatalog().featuredMods) {
    const values = mod.presets[profile]
    if (values != null) result[mod.id] = values
  }
  return result
}
