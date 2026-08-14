export type ModManifestInfo = {
  id: string
  name: string
  version: string
  entry: string
  api: number
  description: string
  category?: string
  gameVersion?: string
  permissions: string[]
  dependencies: string[]
  conflicts: string[]
  github?: string
  optionsSchema?: string
}

const RESERVED_IDS = new Set(["__proto__", "prototype", "constructor"])
const PERMISSIONS = new Set(["network", "filesystem", "engine_internals"])
const FORBIDDEN_PAYLOAD_EXTENSIONS = new Set(["gb", "gbc", "rom", "z64", "n64", "v64", "sav", "state", "ipa"])

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function boundedText(value: unknown, label: string, maximum: number, required = false): string {
  if (value == null && !required) return ""
  if (typeof value !== "string") throw new Error(`${label} must be text.`)
  const text = value.trim()
  if ((required && text === "") || text.length > maximum || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new Error(`${label} is empty, too long, or contains control characters.`)
  }
  return text
}

function stringList(value: unknown, label: string, maximum = 64): string[] {
  if (value == null) return []
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} must be a bounded list.`)
  const result: string[] = []
  for (const item of value) {
    const text = boundedText(item, `${label} entry`, 160, true)
    if (!result.includes(text)) result.push(text)
  }
  return result
}

export function safeModRelativePath(value: string): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 240 || value.includes("\0")) return null
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "").normalize("NFC")
  if (normalized === "" || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || normalized.includes(":")) return null
  const parts = normalized.split("/")
  if (parts.some(part => part === "" || part === "." || part === ".." || /[\u0000-\u001f\u007f]/.test(part))) return null
  return normalized
}

export function forbiddenModPayload(path: string): boolean {
  const name = path.toLowerCase().split("/").pop() || ""
  const extension = name.includes(".") ? name.split(".").pop() || "" : ""
  return FORBIDDEN_PAYLOAD_EXTENSIONS.has(extension)
}

export function parseGitHubRepo(value: unknown): string | null {
  if (typeof value !== "string") return null
  let text = value.trim()
  const url = text.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/)
  if (url) text = `${url[1]}/${url[2]}`
  const pair = text.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/)
  if (!pair) return null
  const owner = pair[1]
  const repository = pair[2].replace(/\.git$/i, "")
  if (owner === "." || owner === ".." || repository === "." || repository === "..") return null
  return `${owner}/${repository}`
}

export function parseGitHubReleaseReference(value: string): { repo: string; tag?: string } | null {
  if (typeof value !== "string") return null
  const match = value.trim().match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/releases(?:\/tag\/([^/?#]+)|\/latest)?)?\/?$/)
  if (match == null) return null
  const repo = parseGitHubRepo(`${match[1]}/${match[2]}`)
  if (repo == null) return null
  let tag: string | undefined
  try {
    tag = match[3] == null ? undefined : decodeURIComponent(match[3])
  } catch {
    return null
  }
  if (tag != null && (tag === "" || tag.length > 120 || /[\u0000-\u001f\u007f/]/.test(tag))) return null
  return { repo, tag }
}

export function parseModManifest(value: unknown): ModManifestInfo {
  const source = record(value)
  if (source == null) throw new Error("manifest.json must contain a JSON object.")
  const id = boundedText(source.id, "Mod id", 64, true)
  if (!/^[A-Za-z0-9_-]+$/.test(id) || RESERVED_IDS.has(id)) {
    throw new Error("Mod id may contain only letters, numbers, underscores, or hyphens.")
  }
  const name = boundedText(source.name, "Mod name", 100, true)
  const version = boundedText(source.version, "Mod version", 48, true)
  const entry = boundedText(source.entry, "Mod entry", 180, true)
  if (safeModRelativePath(entry) == null) throw new Error("Mod entry is not a safe relative path.")
  const api = source.api == null ? 1 : Number(source.api)
  if (!Number.isInteger(api) || api < 1 || api > 2) throw new Error("This build supports Gen1Recomp mod API 1 or 2 only.")
  const permissions = stringList(source.permissions, "permissions", 16)
  for (const permission of permissions) {
    if (!PERMISSIONS.has(permission)) throw new Error(`Unknown mod permission: ${permission}`)
  }
  let github: string | undefined
  if (source.github != null) {
    const parsedRepo = parseGitHubRepo(source.github)
    if (parsedRepo == null) throw new Error("The manifest GitHub source is not a valid owner/repository value.")
    github = parsedRepo
  }
  const gameVersion = boundedText(source.game_version, "game_version", 160)
  const optionsSchema = boundedText(source.options_schema, "options_schema", 180)
  if (optionsSchema !== "" && safeModRelativePath(optionsSchema) == null) {
    throw new Error("options_schema is not a safe relative path.")
  }
  return {
    id,
    name,
    version,
    entry,
    api,
    description: boundedText(source.description, "description", 1200),
    category: boundedText(source.category, "category", 40) || undefined,
    gameVersion: gameVersion || undefined,
    permissions,
    dependencies: stringList(source.dependencies, "dependencies"),
    conflicts: [...stringList(source.conflicts, "conflicts"), ...stringList(source.incompatible, "incompatible")]
      .filter((item, index, list) => list.indexOf(item) === index),
    github,
    optionsSchema: optionsSchema || undefined,
  }
}

type ParsedVersion = { numbers: number[]; prerelease: string[] }

function parsedVersion(value: string): ParsedVersion | null {
  const match = value.trim().replace(/^v/i, "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!match) return null
  return {
    numbers: [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)],
    prerelease: match[4] == null ? [] : match[4].split("."),
  }
}

export function compareModVersions(left: string, right: string): number {
  const a = parsedVersion(left)
  const b = parsedVersion(right)
  if (a == null || b == null) return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" })
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] < b.numbers[index] ? -1 : 1
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length === 0 ? 1 : -1
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const av = a.prerelease[index]
    const bv = b.prerelease[index]
    if (av == null || bv == null) return av == null ? -1 : 1
    if (av === bv) continue
    const an = /^\d+$/.test(av) ? Number(av) : null
    const bn = /^\d+$/.test(bv) ? Number(bv) : null
    if (an != null && bn != null) return an < bn ? -1 : 1
    if (an != null || bn != null) return an != null ? -1 : 1
    return av < bv ? -1 : 1
  }
  return 0
}
