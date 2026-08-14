#!/usr/bin/env python3
"""Regress the exact Wilds 1.12.2 rgba4 guard with official PUC Lua 5.1.

Usage:
  python3 tools/test_wilds_compat.py /path/to/Wilds.of.Kanto.v1.12.2.zip /path/to/lua5.1

The public mod archive is read only and is never copied into the project.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "runtime" / "gen1recomp-layer-2.1.0.love"
EXPECTED_ARCHIVE = "7272a62c7d72f069295281835c0a6cdbaccd2bcf0c24b2b8284c90b9d68a8e3b"
EXPECTED_SOURCE = "9b1f8c1be82036c30cb6ea5be592acb3be34e210562fb27e1d585bd37b6c4b43"
SOURCE_SUFFIX = "/lib/spawn_render.lua"
CHUNK_NAME = "@mods/overworld_wild_spawns/lib/spawn_render.lua"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run(lua: Path, script: Path, *args: str) -> None:
    subprocess.run([str(lua), str(script), *args], check=True)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: test_wilds_compat.py Wilds.of.Kanto.v1.12.2.zip /path/to/lua5.1")
    archive = Path(sys.argv[1]).expanduser().resolve()
    lua = Path(sys.argv[2]).expanduser().resolve()
    if not lua.is_file():
        raise SystemExit("The supplied PUC Lua 5.1 executable does not exist.")
    archive_bytes = archive.read_bytes()
    if digest(archive_bytes) != EXPECTED_ARCHIVE:
        raise SystemExit("Refusing fixture: the archive is not exact Wilds of Kanto v1.12.2.")

    with ZipFile(archive) as package:
        matches = [name for name in package.namelist() if name.endswith(SOURCE_SUFFIX)]
        if len(matches) != 1:
            raise SystemExit("The exact Wilds spawn_render.lua path is ambiguous or missing.")
        source = package.read(matches[0])
    if len(source) != 91_263 or digest(source) != EXPECTED_SOURCE:
        raise SystemExit("The Wilds spawn_render.lua source identity is unexpected.")

    with ZipFile(ENGINE) as package:
        main_source = package.read("compat/core-main.lua").decode("utf-8")
    start = main_source.index("local function sourceLineParts")
    end = main_source.index("local editorMode = ", start)
    bootstrap = main_source[start:end]

    with tempfile.TemporaryDirectory(prefix="gen1-wilds-compat-") as temporary:
        work = Path(temporary)
        source_path = work / "spawn_render.lua"
        output_path = work / "spawn_render.transformed.lua"
        source_path.write_bytes(source)

        transform = work / "transform.lua"
        transform.write_text(
            "love = {\n"
            "  system = { getOS = function() return \"Web\" end },\n"
            "  graphics = {\n"
            "    getCanvasFormats = function() return {} end,\n"
            "    newCanvas = function(...) return { ... } end,\n"
            "  },\n"
            "}\n"
            + bootstrap
            + f"""
local input = assert(io.open({json.dumps(str(source_path))}, "rb"))
local source = input:read("*a")
input:close()
local chunkName = {json.dumps(CHUNK_NAME)}
local output, loops, guards = GEN1RECOMP_LUA51_SOURCE(source, chunkName)
assert(loops == 0, "unexpected continue rewrite")
assert(guards == 1, "expected one exact Wilds image guard")
assert(output:find('imageFormat ~= "rgba8" and imageFormat ~= "rgba16"', 1, true))
local second, loops2, guards2 = GEN1RECOMP_LUA51_SOURCE(output, chunkName)
assert(second == output and loops2 == 0 and guards2 == 0, "transform is not idempotent")
local other, _, otherGuards = GEN1RECOMP_LUA51_SOURCE(source,
  "@mods/unrelated/lib/spawn_render.lua")
assert(other == source and otherGuards == 0, "unrelated module path changed")
local compiled, compileError = loadstring(source, chunkName)
assert(compiled, compileError)
local out = assert(io.open({json.dumps(str(output_path))}, "wb"))
out:write(output)
out:close()
print("Exact Wilds source guard passed", #source, #output, guards)
""",
            encoding="utf-8",
        )
        run(lua, transform)

        transformed = output_path.read_text("utf-8")
        function_start = transformed.index("local function bakeSheet")
        function_end = transformed.index("\nlocal function probeImageLoad", function_start)
        bake_function = transformed[function_start:function_end]
        behavior = work / "behavior.lua"
        behavior.write_text(
            r'''
local format = arg[1]
local encodeCalls, writes = 0, 0
local CELL, CACHE_DIR = 16, "overworld_wild_spawns-cache"
local function isOsAbsolutePath() return false end
local function fsExists() return true end
local src = { getDimensions = function() return 32, 32 end }
local function tryRequire(name)
  assert(name == "src.render.Assets")
  return { image = function() return src end }, nil
end
local idata = {
  getFormat = function() return format end,
  encode = function()
    encodeCalls = encodeCalls + 1
    return { getString = function() return "PNG" end }
  end,
}
local canvas = {
  newImageData = function() return idata end,
  release = function() end,
}
love = {
  image = {},
  graphics = {
    newCanvas = function() return canvas end,
    setCanvas = function() end,
    clear = function() end,
    setColor = function() end,
    draw = function() end,
  },
  filesystem = {
    createDirectory = function() return true end,
    write = function() writes = writes + 1; return true end,
  },
}
'''
            + bake_function
            + r'''
local result = bakeSheet("PIDGEY", "front.png", function() end)
if format == "rgba4" then
  assert(result == nil and encodeCalls == 0 and writes == 0,
    "rgba4 must use Wilds' nil fallback without entering the encoder")
elseif format == "rgba8" then
  assert(result == "overworld_wild_spawns-cache/pidgey.png")
  assert(encodeCalls == 1 and writes == 1,
    "rgba8 encode/write behavior must remain intact")
else
  error("unexpected test format")
end
print("Wilds bake behavior passed", format, encodeCalls, writes, tostring(result))
''',
            encoding="utf-8",
        )
        run(lua, behavior, "rgba4")
        run(lua, behavior, "rgba8")

    print("Exact Wilds v1.12.2 compatibility regression passed")


if __name__ == "__main__":
    main()
