#!/usr/bin/env python3
"""Run revision-9 source guards against the exact PotatoVoxel v1.4.4 archive."""
from __future__ import annotations

import argparse
import hashlib
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAYER = ROOT / "runtime" / "gen1recomp-layer-2.1.0.love"
EXPECTED_POTATO_SHA256 = "f9bedd5c1ed1074427fb5a6e3d5acac501f0cc0fba7be3c5516d12abecbb2c64"
FILES = (
    "lib/SpriteBillboards.lua",
    "lib/OverworldBattle.lua",
    "lib/VoxelScene.lua",
)

HARNESS = r'''
local function read(path)
  local file = assert(io.open(path, "rb"))
  local source = file:read("*a")
  file:close()
  return source
end

local root = assert(arg[1])
local sprite = read(root .. "/lib/SpriteBillboards.lua")
local out, loops, images, fixes = GEN1RECOMP_LUA51_SOURCE(
  sprite, "@mods/potato_voxel/lib/SpriteBillboards.lua")
assert(loops == 0 and images == 0 and fixes == 1,
  "exact shadow-blob source did not receive one narrow rewrite")
assert(out:find("indices%[#indices %+ 1%] = 1"),
  "one-based Lua table vertex map was not emitted")
assert(not out:find("indices%[#indices %+ 1%] = 0"),
  "zero vertex-map value survived the shadow-blob rewrite")
assert(loadstring(out, "@SpriteBillboards.lua"),
  "rewritten SpriteBillboards source does not compile in PUC Lua 5.1")
local unchanged, _, _, none = GEN1RECOMP_LUA51_SOURCE(
  sprite, "@mods/not_potato/lib/SpriteBillboards.lua")
assert(none == 0 and unchanged == sprite,
  "same source under another mod id was rewritten")

local battle = read(root .. "/lib/OverworldBattle.lua")
out, _, _, fixes = GEN1RECOMP_LUA51_SOURCE(
  battle, "@mods/potato_voxel/lib/OverworldBattle.lua")
assert(fixes == 2, "battle retirement/traceback guards were not applied atomically")
assert(out:find("if session%.broken then return end"),
  "broken battle session is still retried")
assert(out:find("local ok, shot = xpcall", 1, true),
  "first battle failure no longer retains a complete traceback")
assert(loadstring(out, "@OverworldBattle.lua"),
  "rewritten OverworldBattle source does not compile in PUC Lua 5.1")

local scene = read(root .. "/lib/VoxelScene.lua")
out, _, _, fixes = GEN1RECOMP_LUA51_SOURCE(
  scene, "@mods/potato_voxel/lib/VoxelScene.lua")
assert(fixes == 3, "actor decal one-shot quarantine was not applied atomically")
assert(out:find("actorDecalPassAvailable = false", 1, true),
  "actor decal failure does not latch the feature off")
assert(out:find("actor decal pass disabled after one failure", 1, true),
  "actor decal first-failure evidence is missing")
assert(loadstring(out, "@VoxelScene.lua"),
  "rewritten VoxelScene source does not compile in PUC Lua 5.1")
print("PotatoVoxel v1.4.4 exact-source Web stability tests passed")
'''


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lua", type=Path, required=True,
                        help="verified PUC Lua 5.1 interpreter")
    parser.add_argument("--potato", type=Path, required=True,
                        help="official PotatoVoxel v1.4.4 ZIP")
    args = parser.parse_args()
    if not args.lua.is_file():
        raise SystemExit(f"Missing Lua interpreter: {args.lua}")
    if hashlib.sha256(args.potato.read_bytes()).hexdigest() != EXPECTED_POTATO_SHA256:
        raise SystemExit("PotatoVoxel archive does not match the official v1.4.4 SHA-256")
    if not LAYER.is_file():
        raise SystemExit(f"Missing execution layer: {LAYER}")

    with tempfile.TemporaryDirectory(prefix="gen1recomp-potato-compat-") as temporary:
        target = Path(temporary)
        with zipfile.ZipFile(args.potato) as archive:
            bad = [name for name in FILES if name not in archive.namelist()]
            if bad:
                raise SystemExit(f"Exact PotatoVoxel archive is incomplete: {bad}")
            archive.extractall(target, members=FILES)
        with zipfile.ZipFile(LAYER) as archive:
            core_main = archive.read("compat/core-main.lua").decode()
        start = core_main.index("local function sourceLineParts")
        end = core_main.index("-- LuaJIT accepts a source string", start)
        harness = target / "test.lua"
        harness.write_text(core_main[start:end] + HARNESS)
        subprocess.run([str(args.lua), str(harness), str(target)], check=True,
                       cwd=target)
        subprocess.run([str(args.lua.parent / "luac"), "-p", *FILES], check=True,
                       cwd=target)


if __name__ == "__main__":
    main()
