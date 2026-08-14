import type { InstalledMod, ModOptionSchemaRow } from "../modules/types"
import {
  forgetNativeModOptionMetadata,
  invalidateNativeModOptionState,
  loadNativeModOptionState,
  modOptionValue,
  parseDeclarativeOptionSchema,
  performanceProfileDidChange,
  restoreNativeModDefaults,
  setNativeModOption,
} from "../modules/mod-options"
import { MOD_OPTIONS_BACKUP_FILE, MOD_OPTIONS_MIRROR_FILE } from "../modules/paths"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const schema = parseDeclarativeOptionSchema(`
-- Data-only declaration: comments and literal tables are permitted.
return {
  {
    key = "enabled",
    label = "Show Wild Mons",
    type = "toggle",
    default = true,
    description = "Visible overworld creatures.",
  },
  {
    key = "sprite_style",
    label = "Sprite Style",
    type = "choice",
    default = "followers",
    choices = {
      { "Poke Followers / GSC", "followers" },
      { "HGSS / PokeMMO", "pokemmo" },
      { "Pokédex", "pokedex" },
    },
  },
  {
    key = "follower_count",
    label = "Followers",
    type = "choice",
    default = 1,
    choices = { { "0", 0 }, { "1", 1 }, { "2", 2 } },
  },
  {
    key = "spawn_limit",
    label = "Spawn Limit",
    type = "number",
    default = 10,
    min = 0,
    max = 150,
    step = 5,
  },
  { key = "nickname", label = "Name", type = "text", default = "", maxLen = 10 },
}
`, "1.12.2")

assert(schema.rows.length === 5, "Literal option rows were not captured")
assert(schema.rows[0].type === "toggle" && schema.rows[0].default === true, "Toggle default was not preserved")
assert(schema.rows[1].type === "choice" && schema.rows[1].choices[2].value === "pokedex", "String choices were not preserved")
assert(schema.rows[2].type === "choice" && schema.rows[2].choices[0].value === 0, "Numeric choices were not preserved")
assert(schema.rows[3].type === "number" && schema.rows[3].step === 5, "Number bounds were not preserved")
assert(schema.rows[4].type === "text" && schema.rows[4].maxLen === 10, "Text bounds were not preserved")

const fallbackSchema = parseDeclarativeOptionSchema(`return {
  { key = "toggle_fallback", type = "toggle" },
  { key = "number_fallback", type = "number" },
  { key = "choice_fallback", type = "choice", choices = { { "FIRST", "first" }, { "SECOND", "second" } } },
  { key = "text_fallback", type = "text" },
}`, "fallbacks")
assert(fallbackSchema.rows[0].default === false, "Missing toggle default did not normalize to false")
assert(fallbackSchema.rows[1].default === 0, "Missing number default did not normalize to zero")
assert(fallbackSchema.rows[2].default === "first", "Missing choice default did not normalize to the first choice")
assert(fallbackSchema.rows[3].default === "" && fallbackSchema.rows[3].type === "text"
  && fallbackSchema.rows[3].maxLen === 7, "Missing text defaults did not normalize to empty/maxLen 7")

for (const executable of [
  `local x = true\nreturn { { key = "x", type = "toggle", default = x } }`,
  `return makeSchema()`,
  `return { (function() return { key = "x" } end)() }`,
  `return { { key = "x", type = "toggle", default = os.execute("bad") } }`,
  `return { { key = "x", type = "number", default = 1 + 2 } }`,
  `return { { key = "x", type = "toggle" } }; print("trailing")`,
  `return { { ["__proto__"] = "x", key = "safe", type = "toggle" } }`,
]) {
  let rejected = false
  try { parseDeclarativeOptionSchema(executable, "1.0.0") } catch { rejected = true }
  assert(rejected, "Executable Lua was accepted as a native data-only schema")
}

let rejected = false
try {
  parseDeclarativeOptionSchema(`return {
    { key = "duplicate", type = "toggle", default = true },
    { key = "duplicate", type = "toggle", default = false },
  }`, "1.0.0")
} catch { rejected = true }
assert(rejected, "Duplicate option keys were accepted")
for (const invalidSchema of [
  `return { { key = "choice", type = "choice", choices = { { "A", 1 }, { "B", 1 } } } }`,
  `return { { key = "number", type = "number", min = 10, max = 1 } }`,
  `return { { key = "number", type = "number", step = 0 } }`,
]) {
  rejected = false
  try { parseDeclarativeOptionSchema(invalidSchema, "1.0.0") } catch { rejected = true }
  assert(rejected, "An invalid bounded option row was accepted")
}

const waterRow: ModOptionSchemaRow = {
  key: "water",
  type: "choice",
  label: "WATER",
  default: "full",
  choices: [
    { label: "FULL", value: "full" },
    { label: "SKY", value: "sky" },
    { label: "OFF", value: "off" },
  ],
}
const numericRow: ModOptionSchemaRow = {
  key: "amount", type: "number", label: "AMOUNT", default: 4, min: 0, max: 10, step: 2,
}
const mod: InstalledMod = {
  id: "DRAMATIC_SHAPE",
  name: "Dramatic Shape",
  version: "1.8.2",
  description: "",
  entry: "main.lua",
  api: 2,
  enabled: true,
  permissions: [], dependencies: [], conflicts: [],
  archiveSha256: "0".repeat(64),
  byteLength: 1, fileCount: 1,
  installedAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
  optionSchema: {
    version: "1.8.2", capturedAt: new Date(0).toISOString(), origin: "runtime",
    rows: [waterRow, numericRow],
  },
}

invalidateNativeModOptionState()
assert(modOptionValue(mod, waterRow, "balanced") === "sky", "Balanced profile did not seed an unspecified mod setting")
setNativeModOption(mod, waterRow, "off")
assert(modOptionValue(mod, waterRow, "balanced") === "off", "Explicit native choice did not override the profile")
setNativeModOption(mod, numericRow, 8)
assert(modOptionValue(mod, numericRow, "balanced") === 8, "Bounded number option was not stored")

// The second transaction leaves the first complete state as the recovery copy.
;(globalThis as any).FileManager.writeAsStringSync(MOD_OPTIONS_MIRROR_FILE, "{broken")
invalidateNativeModOptionState()
assert(modOptionValue(mod, waterRow, "balanced") === "off", "Corrupt-primary recovery did not restore the prior complete state")
assert(modOptionValue(mod, numericRow, "balanced") === 4, "Backup recovery unexpectedly retained an uncommitted later value")
assert((globalThis as any).FileManager.existsSync(MOD_OPTIONS_BACKUP_FILE), "A recovered state was not backed up")

setNativeModOption(mod, numericRow, 8)
rejected = false
try { setNativeModOption(mod, numericRow, 11) } catch { rejected = true }
assert(rejected, "Out-of-range number option was accepted")
rejected = false
try { setNativeModOption(mod, numericRow, 7) } catch { rejected = true }
assert(rejected, "A number outside the declared step was accepted")

restoreNativeModDefaults(mod)
assert(modOptionValue(mod, waterRow, "balanced") === "full", "Per-mod reset did not restore the genuine declared default")
assert(modOptionValue(mod, numericRow, "balanced") === 4, "Per-mod reset did not restore an unrelated genuine number default")
performanceProfileDidChange()
assert(modOptionValue(mod, waterRow, "balanced") === "sky", "Choosing a performance profile did not re-enable its managed preset")

setNativeModOption(mod, waterRow, "off")
setNativeModOption(mod, numericRow, 8)
const mutableState = loadNativeModOptionState()
mutableState.schemas[mod.id] = { version: mod.version, rows: [waterRow, numericRow] }
mutableState.probed[mod.id] = mod.version
mutableState.suppressProfile[mod.id] = true
forgetNativeModOptionMetadata(mod.id)
const persisted = JSON.parse((globalThis as any).FileManager.readAsStringSync(MOD_OPTIONS_MIRROR_FILE))
assert(persisted.values[mod.id].water === "off" && persisted.values[mod.id].amount === 8,
  "Uninstall metadata cleanup discarded upstream-compatible primitive values")
assert(persisted.known[mod.id].includes("water") && persisted.known[mod.id].includes("amount"),
  "Uninstall metadata cleanup discarded known value keys")
assert(persisted.schemas[mod.id] == null && persisted.probed[mod.id] == null && persisted.suppressProfile[mod.id] == null,
  "Uninstall metadata cleanup retained stale schema, probe, or profile-suppression state")
assert(!(globalThis as any).FileManager.existsSync(`${MOD_OPTIONS_MIRROR_FILE}.tmp`),
  "A completed native option transaction left its staging file behind")

console.log("Native mod-option schema/state tests passed")
