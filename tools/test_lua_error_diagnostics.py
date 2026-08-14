#!/usr/bin/env python3
"""Regress first-failure Lua traceback persistence with official PUC Lua 5.1.

Usage:
  python3 tools/test_lua_error_diagnostics.py /path/to/lua5.1

The test reads the bundled patched engine, executes only its isolated
SwitchDiagnostics module against an in-memory filesystem, and writes no user
ROM or save data.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "runtime" / "gen1recomp-layer-2.1.0.love"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: test_lua_error_diagnostics.py /path/to/lua5.1")
    lua = Path(sys.argv[1]).expanduser().resolve()
    if not lua.is_file():
        raise SystemExit("The supplied PUC Lua 5.1 executable does not exist.")

    with ZipFile(ENGINE) as package:
        diagnostics = package.read("src/debug/SwitchDiagnostics.lua")
        main_source = package.read("compat/core-main.lua").decode("utf-8")

    source = diagnostics.decode("utf-8")
    guard = 'filesystem.getInfo(ERROR_LOG, "file")'
    if guard not in source or 'local existing = filesystem.read(ERROR_LOG)' in source:
        raise SystemExit("The bundled diagnostics module lacks the first-error read guard.")
    marker = 'print("[native-lua-error] " .. detail)'
    persist = "SwitchDiagnostics.logLuaError(detail)"
    if marker not in main_source or persist not in main_source:
        raise SystemExit("The bundled engine lacks complete Lua-error reporting.")
    if main_source.index(marker) > main_source.index(persist):
        raise SystemExit("The original traceback is not printed before filesystem persistence.")

    with tempfile.TemporaryDirectory(prefix="gen1-lua-error-") as temporary:
        work = Path(temporary)
        module = work / "SwitchDiagnostics.lua"
        module.write_bytes(diagnostics)
        harness = work / "harness.lua"
        harness.write_text(
            f'''local files = {{
  ["build-info.json"] = '{{"version":"0.1.78","loveNxTag":"11.5-nx1","gitCommit":"2fabc03"}}',
}}
local reads = {{}}
local writes = {{}}
local filesystem = {{}}
function filesystem.getInfo(path, kind)
  local value = files[path]
  if value == nil then return nil end
  if kind and kind ~= "file" then return nil end
  return {{ type = "file", size = #value }}
end
function filesystem.read(path)
  reads[path] = (reads[path] or 0) + 1
  assert(files[path] ~= nil, "attempted missing read: " .. tostring(path))
  return files[path]
end
function filesystem.write(path, value)
  writes[path] = (writes[path] or 0) + 1
  files[path] = value
  return true
end
function filesystem.remove(path)
  files[path] = nil
  return true
end
love = {{
  filesystem = filesystem,
  system = {{ getOS = function() return "Web" end }},
}}
local SwitchDiagnostics = assert(loadfile({json.dumps(str(module))}))()

local firstHint = SwitchDiagnostics.logLuaError("first failure")
assert(firstHint == "Details saved to lua-error.log in the save directory.")
assert((reads["lua-error.log"] or 0) == 0,
  "first failure must not read the absent optional log")
assert(files["lua-error.log"]:find("first failure", 1, true))
assert(files["lua-error.log"]:find("buildVersion=0.1.78", 1, true))

local firstLog = files["lua-error.log"]
SwitchDiagnostics.logLuaError("second failure")
assert(reads["lua-error.log"] == 1, "existing error log should be appended once")
assert(files["lua-error.log"]:sub(1, #firstLog) == firstLog)
assert(files["lua-error.log"]:find("second failure", 1, true))

local oversized = string.rep("x", 32 * 1024 + 1)
files["lua-error.log"] = oversized
SwitchDiagnostics.logLuaError("rotated failure")
assert(files["lua-error.log.1"] == oversized, "oversized history was not rotated")
assert(not files["lua-error.log"]:find(oversized, 1, true))
assert(files["lua-error.log"]:find("rotated failure", 1, true))

SwitchDiagnostics.logLuaError("binary" .. string.char(1) .. "message")
assert(files["lua-error.log"]:find("<redacted>", 1, true),
  "binary-looking error content was not redacted")
print("Lua error diagnostics behavior passed",
  reads["lua-error.log"] or 0, writes["lua-error.log"] or 0)
''',
            encoding="utf-8",
        )
        subprocess.run([str(lua), str(harness)], check=True)

    print("First-failure Lua diagnostics regression passed")


if __name__ == "__main__":
    main()
