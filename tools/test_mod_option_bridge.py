#!/usr/bin/env python3
"""Exercise the embedded Lua 5.1 native mod-option schema/value bridge."""
from __future__ import annotations

import argparse
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAYER = ROOT / "runtime" / "gen1recomp-layer-2.1.0.love"
CORE = ROOT / "runtime" / "gen1recomp-core-0.1.78.love"

HARNESS = r'''
local realRequire = require
local Json = dofile("src/link/Json.lua")
local Logger = { info=function() end, warn=function() end,
  error=function(...) print("LOGGER_ERROR", ...) end }
local stubs = {
  ["src.link.Json"] = Json,
  ["src.core.Logger"] = Logger,
  ["src.core.Version"] = { engine = "0.1.78" },
  ["src.mods.Schemas"] = { REGISTRIES = {}, ENGINE = "base" },
  ["src.mods.Events"] = { new = function() return {} end },
  ["src.mods.Hooks"] = { new = function() return {} end },
  ["src.mods.Runtime"] = {},
  ["src.mods.Gen2Compat"] = {},
}
function require(name)
  if stubs[name] then return stubs[name] end
  if name:match("^src%.") then return {} end
  return realRequire(name)
end

local Loader = dofile("src/mods/Loader.lua")
local written
local fs = {
  write = function(_, data) written = data return true end,
  load = function() return nil end,
}
local self = setmetatable({
  fs = fs,
  loaded = { { manifest = { id = "fixture", version = "1.2.3" } } },
  optionSchemas = { fixture = {
    { key = "on", type = "toggle", label = "ON" },
    { key = "amount", type = "number", label = "AMOUNT", min = 0, max = 9, step = 1 },
    { key = "style", type = "choice", label = "STYLE", choices = { { "A", "a" }, { "B", "b" } } },
    -- PotatoVoxel v1.4.4's SHADOWS row is a choice (not a toggle) whose
    -- canonical RFC 0008 tuple values are true and false. The old a-and-b-or-c
    -- idiom collapsed the false value to nil and rejected all twelve rows.
    { key = "shadows", type = "choice", label = "SHADOWS", default = true,
      choices = { { "ON", true }, { "OFF", false } } },
    -- Common dynamic object spelling is normalized to the canonical tuple.
    { key = "objectChoice", type = "choice", label = "OBJECT", default = false,
      choices = { { label = "OFF", value = false }, { label = "ON", value = true } } },
    { key = "name", type = "text", label = "NAME" },
    { key = "aliasText", type = "text", label = "ALIAS", maxLength = 12 },
    -- One malformed dynamic row must not erase valid siblings.
    { key = "unsupported", type = "future-widget", label = "FUTURE" },
  } },
  modOptions = { fixture = { on = false, amount = 5, style = "b", name = "RED" } },
  nativeOriginalOptions = { fixture = { on = false, amount = 5, style = "b", name = "RED" } },
  nativeOptionState = { schema = 2, values = {}, known = {}, suppressProfile = {},
    schemas = {}, probed = {}, profile = {} },
}, { __index = Loader })

self:_finalizeNativeOptions()
assert(type(written) == "string" and #written > 0, "schema mirror was not written")
local state = Json.decode(written)
assert(state.probed.fixture == "1.2.3", "loaded mod version was not marked probed")
assert(#state.schemas.fixture.rows == 7, "valid dynamic rows were lost with a malformed sibling")
assert(state.schemas.fixture.rows[1].default == false, "missing toggle default did not normalize to OFF")
assert(state.schemas.fixture.rows[2].default == 0, "missing number default did not normalize to zero")
assert(state.schemas.fixture.rows[3].default == "a", "missing choice default did not normalize to first choice")
assert(state.schemas.fixture.rows[4].choices[2][2] == false,
  "PotatoVoxel boolean false choice was collapsed or rejected")
assert(state.schemas.fixture.rows[5].choices[1][1] == "OFF"
  and state.schemas.fixture.rows[5].choices[1][2] == false,
  "object choice spelling was not normalized to an RFC 0008 tuple")
assert(state.schemas.fixture.rows[6].default == "", "missing text default did not normalize to empty text")
assert(state.schemas.fixture.rows[6].maxLen == 7, "engine text maxLen fallback was not preserved")
assert(state.schemas.fixture.rows[7].maxLen == 12, "text maxLength compatibility alias was not bounded")
assert(state.values.fixture.on == false, "false legacy value was not migrated")
assert(state.values.fixture.amount == 5, "number legacy value was not migrated")

self.modOptions.fixture.amount = 8
GEN1RECOMP_NATIVE_OPTIONS_CAPTURE(self.modOptions)
state = Json.decode(written)
assert(state.values.fixture.amount == 8, "in-game number edit was not mirrored")
assert(state.schemas.fixture.rows[3].choices[2][2] == "b", "choice labels/values were not preserved")
print("Lua native mod-option bridge tests passed")
'''


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lua", type=Path, required=True, help="verified PUC Lua 5.1 interpreter")
    args = parser.parse_args()
    if not LAYER.is_file() or not CORE.is_file():
        raise SystemExit(f"Missing layer/core pair: {LAYER}, {CORE}")
    if not args.lua.is_file():
        raise SystemExit(f"Missing Lua interpreter: {args.lua}")
    with tempfile.TemporaryDirectory(prefix="gen1recomp-option-bridge-") as temporary:
        root = Path(temporary)
        with zipfile.ZipFile(LAYER) as archive:
            for name in ("src/mods/Loader.lua", "src/core/SaveData.lua"):
                archive.extract(name, root)
        with zipfile.ZipFile(CORE) as archive:
            archive.extract("src/link/Json.lua", root)
        harness = root / "test.lua"
        harness.write_text(HARNESS)
        subprocess.run([str(args.lua), str(harness)], cwd=root, check=True)
        subprocess.run([str(args.lua.parent / "luac"), "-p", "src/mods/Loader.lua", "src/core/SaveData.lua"], cwd=root, check=True)


if __name__ == "__main__":
    main()
