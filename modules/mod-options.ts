import type {
  InstalledMod,
  ModLibraryDocument,
  ModOptionChoice,
  ModOptionPrimitive,
  ModOptionSchema,
  ModOptionSchemaRow,
} from "./types"
import type { PerformanceProfile } from "./config"
import { managedModOptionKeys, modOverridesForProfile } from "./config"
import {
  MOD_OPTIONS_BACKUP_FILE,
  MOD_OPTIONS_MIRROR_FILE,
  SAVES_ROOT,
  ensureStorage,
} from "./paths"

const MAX_STATE_BYTES = 512 * 1024
const MAX_SCHEMA_SOURCE_BYTES = 256 * 1024
const MAX_MODS = 256
const MAX_ROWS_PER_MOD = 128
const MAX_TOTAL_ROWS = 2048
const MAX_CHOICES_PER_ROW = 128
const MAX_TEXT_VALUE = 512
const MAX_DESCRIPTION = 1200
const MAX_PARSE_DEPTH = 20
const MAX_PARSE_NODES = 16_384
const RESERVED_KEYS = new Set(["__proto__", "prototype", "constructor"])

type NativeSchemaRecord = {
  version: string
  rows: ModOptionSchemaRow[]
}

export type NativeModOptionState = {
  schema: 2
  values: Record<string, Record<string, ModOptionPrimitive>>
  known: Record<string, string[]>
  suppressProfile: Record<string, boolean>
  schemas: Record<string, NativeSchemaRecord>
  probed: Record<string, string>
}

type LuaTable = {
  array: unknown[]
  fields: Map<string, unknown>
}

function object(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function nullRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>
}

function safeId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value)
    && !RESERVED_KEYS.has(value) ? value : null
}

function safeKey(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(value)
    && !RESERVED_KEYS.has(value) ? value : null
}

function boundedString(value: unknown, maximum: number, fallback = ""): string {
  return typeof value === "string" && value.length <= maximum && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    ? value : fallback
}

function primitive(value: unknown): ModOptionPrimitive | null {
  if (typeof value === "boolean") return value
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.length <= MAX_TEXT_VALUE
      && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return value
  return null
}

function samePrimitive(left: ModOptionPrimitive, right: ModOptionPrimitive): boolean {
  return typeof left === typeof right && left === right
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function sanitizeChoice(value: unknown): ModOptionChoice | null {
  const source = object(value)
  if (!Array.isArray(value) && source == null) return null
  const label = boundedString(Array.isArray(value) ? value[0] : source?.label, 160)
  const selected = primitive(Array.isArray(value) ? value[1] : source?.value)
  if (label === "" || selected == null) return null
  return { label, value: selected }
}

function sanitizeRow(value: unknown): ModOptionSchemaRow | null {
  const row = object(value)
  const key = safeKey(row?.key)
  const type = row?.type
  if (row == null || key == null || (type !== "toggle" && type !== "choice"
      && type !== "number" && type !== "text")) return null
  const label = boundedString(row.label, 160, key)
  const description = boundedString(row.description, MAX_DESCRIPTION)
    || boundedString(row.help, MAX_DESCRIPTION)
  if (type === "toggle") {
    return { key, type, label, default: typeof row.default === "boolean" ? row.default : false, description: description || undefined }
  }
  if (type === "choice") {
    if (!Array.isArray(row.choices) || row.choices.length === 0
        || row.choices.length > MAX_CHOICES_PER_ROW) return null
    const choices: ModOptionChoice[] = []
    for (const item of row.choices) {
      const choice = sanitizeChoice(item)
      if (choice == null || choices.some(existing => samePrimitive(existing.value, choice.value))) return null
      choices.push(choice)
    }
    const declaredDefault = primitive(row.default)
    const defaultValue = declaredDefault != null && choices.some(choice => samePrimitive(choice.value, declaredDefault))
      ? declaredDefault : choices[0].value
    return { key, type, label, default: defaultValue, choices, description: description || undefined }
  }
  if (type === "number") {
    const defaultValue = finite(row.default) ?? 0
    const min = finite(row.min)
    const max = finite(row.max)
    const step = finite(row.step)
    if ((min != null && max != null && min > max) || (step != null && step <= 0)) return null
    return {
      key, type, label, default: defaultValue,
      min, max, step,
      description: description || undefined,
    }
  }
  const defaultValue = typeof row.default === "string" && row.default.length <= MAX_TEXT_VALUE ? row.default : ""
  const requestedMax = finite(row.maxLen)
  const maxLen = requestedMax == null ? 7 : Math.max(1, Math.min(MAX_TEXT_VALUE, Math.floor(requestedMax)))
  if (defaultValue.length > maxLen) return null
  return { key, type, label, default: defaultValue, maxLen, description: description || undefined }
}

function sanitizeRows(value: unknown): ModOptionSchemaRow[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ROWS_PER_MOD) return null
  const rows: ModOptionSchemaRow[] = []
  const keys = new Set<string>()
  for (const item of value) {
    const row = sanitizeRow(item)
    if (row == null || keys.has(row.key)) return null
    keys.add(row.key)
    rows.push(row)
  }
  return rows
}

export function sanitizeModOptionSchema(value: unknown, expectedVersion?: string): ModOptionSchema | null {
  const source = object(value)
  if (source == null) return null
  const version = boundedString(source.version, 48)
  const rows = sanitizeRows(source.rows)
  if (version === "" || rows == null || (expectedVersion != null && version !== expectedVersion)) return null
  const capturedAt = boundedString(source.capturedAt, 40) || new Date().toISOString()
  const origin = source.origin === "declarative" ? "declarative" : "runtime"
  return { version, capturedAt, origin, rows }
}

class LuaLiteralParser {
  private index = 0
  private nodes = 0

  constructor(private readonly source: string) {}

  parse(): unknown {
    if (this.source.length === 0 || this.source.length > MAX_SCHEMA_SOURCE_BYTES) {
      throw new Error("The declarative options schema is empty or too large.")
    }
    this.skip()
    if (this.readIdentifier() !== "return") throw new Error("The declarative options schema must return one literal table.")
    const value = this.value(0)
    this.skip()
    if (this.peek() === ";") { this.index += 1; this.skip() }
    if (this.index !== this.source.length) throw new Error("Executable Lua is not allowed in a native options schema.")
    return this.toJs(value, 0)
  }

  private peek(offset = 0): string {
    return this.source[this.index + offset] ?? ""
  }

  private fail(message: string): never {
    throw new Error(`${message} (byte ${this.index}).`)
  }

  private longBracket(start: number): { equals: number; contentStart: number } | null {
    if (this.source[start] !== "[") return null
    let cursor = start + 1
    while (this.source[cursor] === "=") cursor += 1
    if (this.source[cursor] !== "[") return null
    return { equals: cursor - start - 1, contentStart: cursor + 1 }
  }

  private readLong(): string | null {
    const opening = this.longBracket(this.index)
    if (opening == null) return null
    const close = `]${"=".repeat(opening.equals)}]`
    const end = this.source.indexOf(close, opening.contentStart)
    if (end < 0) this.fail("Unterminated long string or comment")
    let text = this.source.slice(opening.contentStart, end)
    if (text.startsWith("\r\n")) text = text.slice(2)
    else if (text.startsWith("\n") || text.startsWith("\r")) text = text.slice(1)
    this.index = end + close.length
    return text
  }

  private skip(): void {
    while (true) {
      while (/\s/.test(this.peek())) this.index += 1
      if (this.peek() !== "-" || this.peek(1) !== "-") return
      this.index += 2
      const long = this.readLong()
      if (long == null) {
        while (this.peek() !== "" && this.peek() !== "\n" && this.peek() !== "\r") this.index += 1
      }
    }
  }

  private readIdentifier(): string | null {
    this.skip()
    const match = this.source.slice(this.index).match(/^[A-Za-z_][A-Za-z0-9_]*/)
    if (match == null) return null
    this.index += match[0].length
    return match[0]
  }

  private readString(): string | null {
    this.skip()
    const quote = this.peek()
    if (quote !== "\"" && quote !== "'") return this.readLong()
    this.index += 1
    let result = ""
    while (true) {
      const char = this.peek()
      if (char === "") this.fail("Unterminated quoted string")
      this.index += 1
      if (char === quote) return result
      if (char !== "\\") {
        if (char === "\n" || char === "\r") this.fail("A quoted string contains a raw newline")
        result += char
      } else {
        const escape = this.peek()
        if (escape === "") this.fail("Unterminated string escape")
        this.index += 1
        const simple: Record<string, string> = {
          a: "\u0007", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\u000b",
          "\\": "\\", "\"": "\"", "'": "'",
        }
        if (simple[escape] != null) result += simple[escape]
        else if (escape === "\n") result += "\n"
        else if (escape === "\r") {
          if (this.peek() === "\n") this.index += 1
          result += "\n"
        } else if (/\d/.test(escape)) {
          let digits = escape
          for (let count = 0; count < 2 && /\d/.test(this.peek()); count += 1) {
            digits += this.peek(); this.index += 1
          }
          const code = Number(digits)
          if (code > 255) this.fail("A decimal string escape exceeds 255")
          result += String.fromCharCode(code)
        } else this.fail("Unsupported string escape")
      }
      if (result.length > MAX_TEXT_VALUE * 4) this.fail("A schema string is too long")
    }
  }

  private readNumber(): number | null {
    this.skip()
    const text = this.source.slice(this.index)
    const hex = text.match(/^[+-]?0[xX][0-9A-Fa-f]+/)
    const decimal = text.match(/^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][+-]?\d+)?/)
    const match = hex ?? decimal
    if (match == null) return null
    this.index += match[0].length
    const sign = match[0].startsWith("-") ? -1 : 1
    const unsigned = match[0].replace(/^[+-]/, "")
    const number = /^0[xX]/.test(unsigned) ? sign * Number.parseInt(unsigned.slice(2), 16) : Number(match[0])
    if (!Number.isFinite(number)) this.fail("A schema number is not finite")
    return number
  }

  private value(depth: number): unknown {
    this.skip()
    this.nodes += 1
    if (this.nodes > MAX_PARSE_NODES || depth > MAX_PARSE_DEPTH) this.fail("The schema literal exceeds parser limits")
    if (this.peek() === "{") return this.table(depth + 1)
    if (this.peek() === "\"" || this.peek() === "'" || this.longBracket(this.index) != null) {
      return this.readString()
    }
    const number = this.readNumber()
    if (number != null) return number
    const id = this.readIdentifier()
    if (id === "true") return true
    if (id === "false") return false
    if (id === "nil") return null
    this.fail("Only literal strings, finite numbers, booleans, nil, and tables are allowed")
  }

  private table(depth: number): LuaTable {
    if (this.peek() !== "{") this.fail("Expected a table")
    this.index += 1
    const result: LuaTable = { array: [], fields: new Map<string, unknown>() }
    while (true) {
      this.skip()
      if (this.peek() === "}") { this.index += 1; return result }
      if (this.peek() === "") this.fail("Unterminated table")
      let namedKey: string | null = null
      let fieldValue: unknown
      if (this.peek() === "[") {
        const saved = this.index
        const long = this.readLong()
        if (long != null) {
          this.index = saved
          fieldValue = this.value(depth)
          result.array.push(fieldValue)
        } else {
          this.index += 1
          const keyValue = this.value(depth)
          this.skip()
          if (this.peek() !== "]") this.fail("Expected ] after a table key")
          this.index += 1
          this.skip()
          if (this.peek() !== "=") this.fail("Expected = after a table key")
          this.index += 1
          namedKey = typeof keyValue === "string" || typeof keyValue === "number" ? String(keyValue) : null
          if (namedKey == null) this.fail("A literal table key must be text or a number")
          fieldValue = this.value(depth)
        }
      } else {
        const saved = this.index
        const identifier = this.readIdentifier()
        this.skip()
        if (identifier != null && this.peek() === "=") {
          this.index += 1
          namedKey = identifier
          fieldValue = this.value(depth)
        } else {
          this.index = saved
          fieldValue = this.value(depth)
        }
      }
      if (namedKey == null) result.array.push(fieldValue)
      else {
        if (result.fields.has(namedKey)) this.fail("A literal table contains a duplicate key")
        result.fields.set(namedKey, fieldValue)
      }
      this.skip()
      if (this.peek() === "," || this.peek() === ";") this.index += 1
      else if (this.peek() !== "}") this.fail("Expected a table separator or }")
    }
  }

  private toJs(value: unknown, depth: number): unknown {
    if (depth > MAX_PARSE_DEPTH) this.fail("The schema table is too deeply nested")
    if (value == null || typeof value !== "object" || !("array" in value) || !("fields" in value)) return value
    const table = value as LuaTable
    if (table.fields.size === 0) return table.array.map(item => this.toJs(item, depth + 1))
    const result = nullRecord<unknown>()
    for (let index = 0; index < table.array.length; index += 1) result[String(index + 1)] = this.toJs(table.array[index], depth + 1)
    for (const [key, item] of table.fields) {
      if (RESERVED_KEYS.has(key)) this.fail("A reserved table key is not allowed")
      result[key] = this.toJs(item, depth + 1)
    }
    return result
  }
}

export function parseDeclarativeOptionSchema(source: string, version: string): ModOptionSchema {
  const parsed = new LuaLiteralParser(source).parse()
  const rows = sanitizeRows(parsed)
  if (rows == null) throw new Error("The returned literal is not a supported bounded mod-options schema.")
  return {
    version,
    capturedAt: new Date().toISOString(),
    origin: "declarative",
    rows,
  }
}

function emptyState(): NativeModOptionState {
  return {
    schema: 2,
    values: nullRecord<Record<string, ModOptionPrimitive>>(),
    known: nullRecord<string[]>(),
    suppressProfile: nullRecord<boolean>(),
    schemas: nullRecord<NativeSchemaRecord>(),
    probed: nullRecord<string>(),
  }
}

function sanitizeState(value: unknown): NativeModOptionState | null {
  const source = object(value)
  if (source?.schema !== 2) return null
  const state = emptyState()
  const values = object(source.values)
  const known = object(source.known)
  const suppressed = object(source.suppressProfile)
  const schemas = object(source.schemas)
  const probed = object(source.probed)
  let mods = 0
  let totalRows = 0
  if (values != null) {
    for (const [rawId, rawBucket] of Object.entries(values)) {
      const id = safeId(rawId)
      const bucket = object(rawBucket)
      if (id == null || bucket == null || mods >= MAX_MODS) continue
      const clean = nullRecord<ModOptionPrimitive>()
      for (const [rawKey, rawValue] of Object.entries(bucket)) {
        const key = safeKey(rawKey)
        const selected = primitive(rawValue)
        if (key != null && selected != null && Object.keys(clean).length < MAX_ROWS_PER_MOD) clean[key] = selected
      }
      state.values[id] = clean
      mods += 1
    }
  }
  if (known != null) {
    for (const [rawId, rawKeys] of Object.entries(known)) {
      const id = safeId(rawId)
      if (id == null || !Array.isArray(rawKeys)) continue
      state.known[id] = [...new Set(rawKeys.map(safeKey).filter((key): key is string => key != null))]
        .slice(0, MAX_ROWS_PER_MOD)
    }
  }
  if (suppressed != null) {
    for (const [rawId, enabled] of Object.entries(suppressed)) {
      const id = safeId(rawId)
      if (id != null && enabled === true) state.suppressProfile[id] = true
    }
  }
  if (schemas != null) {
    for (const [rawId, rawSchema] of Object.entries(schemas)) {
      const id = safeId(rawId)
      const candidate = object(rawSchema)
      if (id == null || candidate == null || totalRows >= MAX_TOTAL_ROWS) continue
      const version = boundedString(candidate.version, 48)
      const rows = sanitizeRows(candidate.rows)
      if (version === "" || rows == null || totalRows + rows.length > MAX_TOTAL_ROWS) continue
      state.schemas[id] = { version, rows }
      totalRows += rows.length
    }
  }
  if (probed != null) {
    for (const [rawId, rawVersion] of Object.entries(probed)) {
      const id = safeId(rawId)
      const version = boundedString(rawVersion, 48)
      if (id != null && version !== "") state.probed[id] = version
    }
  }
  return state
}

let cachedState: NativeModOptionState | null = null

function readStateFile(path: string): NativeModOptionState | null {
  if (!FileManager.existsSync(path)) return null
  const data = Data.fromFile(path)
  if (data == null || data.size <= 0 || data.size > MAX_STATE_BYTES) return null
  try {
    return sanitizeState(JSON.parse(data.toRawString("utf-8") || ""))
  } catch {
    return null
  }
}

export function loadNativeModOptionState(): NativeModOptionState {
  if (cachedState != null) return cachedState
  ensureStorage()
  const primary = readStateFile(MOD_OPTIONS_MIRROR_FILE)
  if (primary != null) {
    FileManager.writeAsStringSync(MOD_OPTIONS_BACKUP_FILE, JSON.stringify(primary))
    cachedState = primary
    return primary
  }
  const backup = readStateFile(MOD_OPTIONS_BACKUP_FILE)
  if (backup != null) {
    FileManager.writeAsStringSync(MOD_OPTIONS_MIRROR_FILE, JSON.stringify(backup))
    cachedState = backup
    return backup
  }
  cachedState = emptyState()
  return cachedState
}

export function invalidateNativeModOptionState(): void {
  cachedState = null
}

function saveState(state: NativeModOptionState): void {
  ensureStorage()
  const clean = sanitizeState(state)
  if (clean == null) throw new Error("The native mod-option state is invalid.")
  const encoded = JSON.stringify(clean)
  const data = Data.fromRawString(encoded, "utf-8")
  if (data == null || data.size <= 0 || data.size > MAX_STATE_BYTES) throw new Error("The native mod-option state exceeds its safety limit.")

  const temporary = `${MOD_OPTIONS_MIRROR_FILE}.tmp`
  if (FileManager.existsSync(temporary)) FileManager.removeSync(temporary)
  FileManager.writeAsStringSync(temporary, encoded)
  let backedUp = false
  let installed = false
  try {
    if (FileManager.existsSync(MOD_OPTIONS_BACKUP_FILE)) FileManager.removeSync(MOD_OPTIONS_BACKUP_FILE)
    if (FileManager.existsSync(MOD_OPTIONS_MIRROR_FILE)) {
      FileManager.renameSync(MOD_OPTIONS_MIRROR_FILE, MOD_OPTIONS_BACKUP_FILE)
      backedUp = true
    }
    FileManager.renameSync(temporary, MOD_OPTIONS_MIRROR_FILE)
    installed = true
    cachedState = clean
  } catch (error) {
    if (installed && FileManager.existsSync(MOD_OPTIONS_MIRROR_FILE)) FileManager.removeSync(MOD_OPTIONS_MIRROR_FILE)
    if (backedUp && FileManager.existsSync(MOD_OPTIONS_BACKUP_FILE)) {
      FileManager.renameSync(MOD_OPTIONS_BACKUP_FILE, MOD_OPTIONS_MIRROR_FILE)
    }
    throw error
  } finally {
    if (FileManager.existsSync(temporary)) FileManager.removeSync(temporary)
  }
}

function schemaRecord(schema: ModOptionSchema): NativeSchemaRecord {
  return { version: schema.version, rows: schema.rows }
}

export function nativeModOptionsLaunchEnvelope(
  profile: PerformanceProfile,
  library: ModLibraryDocument,
): NativeModOptionState & { managed: Record<string, string[]>; profile: Record<string, Record<string, ModOptionPrimitive>> } {
  const state = loadNativeModOptionState()
  for (const mod of library.mods) {
    if (mod.optionSchema?.version === mod.version) state.schemas[mod.id] = schemaRecord(mod.optionSchema)
    if (mod.optionsScannedVersion === mod.version) state.probed[mod.id] = mod.version
  }
  const managed = nullRecord<string[]>()
  for (const [id, keys] of Object.entries(state.known)) managed[id] = [...keys]
  for (const mod of library.mods) {
    const keys = new Set(managed[mod.id] ?? [])
    for (const row of mod.optionSchema?.rows ?? []) keys.add(row.key)
    if (keys.size > 0) managed[mod.id] = [...keys].sort()
  }
  for (const [id, keys] of Object.entries(managedModOptionKeys())) {
    const merged = new Set(managed[id] ?? [])
    keys.forEach(key => merged.add(key))
    managed[id] = [...merged].sort()
  }
  const profileValues = modOverridesForProfile(profile)
  for (const id of Object.keys(state.suppressProfile)) delete profileValues[id]
  return { ...state, managed, profile: profileValues }
}

export function reconcileRuntimeModOptionMetadata(library: ModLibraryDocument): boolean {
  const state = loadNativeModOptionState()
  let changed = false
  for (const mod of library.mods) {
    const probed = state.probed[mod.id]
    if (probed === mod.version && mod.optionsScannedVersion !== mod.version) {
      mod.optionsScannedVersion = mod.version
      changed = true
    }
    const runtime = state.schemas[mod.id]
    if (runtime == null || runtime.version !== mod.version) continue
    const next: ModOptionSchema = {
      version: runtime.version,
      capturedAt: new Date().toISOString(),
      origin: "runtime",
      rows: runtime.rows,
    }
    if (JSON.stringify(mod.optionSchema?.rows ?? null) !== JSON.stringify(next.rows)
        || mod.optionSchema?.version !== next.version) {
      mod.optionSchema = next
      mod.optionsScannedVersion = mod.version
      changed = true
    }
  }
  return changed
}

export function modOptionValue(
  mod: InstalledMod,
  row: ModOptionSchemaRow,
  profile: PerformanceProfile,
): ModOptionPrimitive {
  const state = loadNativeModOptionState()
  const stored = state.values[mod.id]?.[row.key]
  if (stored != null) return stored
  if (state.suppressProfile[mod.id] !== true) {
    const profileValue = modOverridesForProfile(profile)[mod.id]?.[row.key]
    if (profileValue != null) return profileValue
  }
  return row.default
}

function validatedValue(row: ModOptionSchemaRow, value: unknown): ModOptionPrimitive {
  if (row.type === "toggle") {
    if (typeof value !== "boolean") throw new Error("This mod option requires an on/off value.")
    return value
  }
  if (row.type === "choice") {
    const selected = primitive(value)
    if (selected == null || !row.choices.some(choice => samePrimitive(choice.value, selected))) {
      throw new Error("This mod option value is not one of the choices declared by the mod.")
    }
    return selected
  }
  if (row.type === "number") {
    const selected = finite(value)
    const stepBase = row.min ?? 0
    const stepUnits = selected == null || row.step == null ? 0 : (selected - stepBase) / row.step
    const stepAligned = row.step == null || (Number.isFinite(stepUnits)
      && Math.abs(stepUnits - Math.round(stepUnits)) <= 1e-9 * Math.max(1, Math.abs(stepUnits)))
    if (selected == null || (row.min != null && selected < row.min)
        || (row.max != null && selected > row.max) || !stepAligned) {
      throw new Error("This number is outside the range or step declared by the mod.")
    }
    return selected
  }
  if (typeof value !== "string" || value.length > row.maxLen
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new Error("This text is longer than the mod allows or contains control characters.")
  }
  return value
}

export function setNativeModOption(mod: InstalledMod, row: ModOptionSchemaRow, value: unknown): void {
  if (mod.optionSchema == null || !mod.optionSchema.rows.some(candidate => candidate.key === row.key)) {
    throw new Error("This mod setting is no longer available.")
  }
  const state = loadNativeModOptionState()
  state.values[mod.id] = state.values[mod.id] ?? nullRecord<ModOptionPrimitive>()
  state.values[mod.id][row.key] = validatedValue(row, value)
  state.known[mod.id] = [...new Set([...(state.known[mod.id] ?? []), row.key])].sort()
  saveState(state)
}

export function restoreNativeModDefaults(mod: InstalledMod): void {
  if (mod.optionSchema == null) throw new Error("This mod has no captured settings schema.")
  const state = loadNativeModOptionState()
  const bucket = state.values[mod.id]
  for (const row of mod.optionSchema.rows) {
    if (bucket != null) delete bucket[row.key]
  }
  state.known[mod.id] = [...new Set([...(state.known[mod.id] ?? []), ...mod.optionSchema.rows.map(row => row.key)])].sort()
  state.suppressProfile[mod.id] = true
  saveState(state)
}

export function performanceProfileDidChange(): void {
  const state = loadNativeModOptionState()
  for (const [id, keys] of Object.entries(managedModOptionKeys())) {
    const bucket = state.values[id]
    for (const key of keys) if (bucket != null) delete bucket[key]
    delete state.suppressProfile[id]
    state.known[id] = [...new Set([...(state.known[id] ?? []), ...keys])].sort()
  }
  saveState(state)
}

export function forgetNativeModOptionMetadata(id: string): void {
  const safe = safeId(id)
  if (safe == null) return
  const state = loadNativeModOptionState()
  delete state.suppressProfile[safe]
  delete state.schemas[safe]
  delete state.probed[safe]
  saveState(state)
}

export function forgetNativeModOptions(id: string): void {
  const safe = safeId(id)
  if (safe == null) return
  const state = loadNativeModOptionState()
  delete state.values[safe]
  delete state.known[safe]
  delete state.suppressProfile[safe]
  delete state.schemas[safe]
  delete state.probed[safe]
  saveState(state)
}

export function modOptionDisplayValue(row: ModOptionSchemaRow, value: ModOptionPrimitive): string {
  if (row.type === "toggle") return value === true ? "ON" : "OFF"
  if (row.type === "choice") return row.choices.find(choice => samePrimitive(choice.value, value))?.label ?? String(value)
  return String(value)
}

export function modHasDiscoveredOptions(mod: InstalledMod): boolean {
  return mod.optionSchema?.version === mod.version && mod.optionSchema.rows.length > 0
}

export function optionsNeedRuntimeDiscovery(mod: InstalledMod): boolean {
  return !modHasDiscoveredOptions(mod) && mod.optionsScannedVersion !== mod.version
}

export function ensureOptionMirrorDirectory(): void {
  if (!FileManager.existsSync(SAVES_ROOT)) FileManager.createDirectorySync(SAVES_ROOT, true)
}
