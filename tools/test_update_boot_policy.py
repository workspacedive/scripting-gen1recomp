#!/usr/bin/env python3
"""Prove the layer-owned updater cannot probe, mount, or execute writable Lua.

Usage:
  python3 tools/test_update_boot_policy.py /path/to/lua5.1
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
LAYER = ROOT / "runtime" / "gen1recomp-layer-2.1.0.love"
CORE = ROOT / "runtime" / "gen1recomp-core-0.1.78.love"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: test_update_boot_policy.py /path/to/lua5.1")
    lua = Path(sys.argv[1]).expanduser().resolve()
    if not lua.is_file():
        raise SystemExit("The supplied PUC Lua 5.1 executable does not exist.")

    with ZipFile(LAYER) as archive:
        boot = archive.read("src/update/Boot.lua")
    with ZipFile(CORE) as archive:
        semver = archive.read("src/update/Semver.lua")

    source = boot.decode("utf-8")
    forbidden = ("love.filesystem.mount", "love.filesystem.load", "loadstring", "require(\"main\")")
    if any(marker in source for marker in forbidden):
        raise SystemExit("The layer-owned updater retains a writable execution primitive.")
    if "writable updater payload execution is disabled" not in source:
        raise SystemExit("The layer-owned updater has no explicit disabled-probe contract.")

    with tempfile.TemporaryDirectory(prefix="gen1-update-policy-") as temporary:
        work = Path(temporary)
        module = work / "src" / "update"
        module.mkdir(parents=True)
        (module / "Boot.lua").write_bytes(boot)
        (module / "Semver.lua").write_bytes(semver)
        harness = work / "harness.lua"
        harness.write_text(r'''
package.path = "./?.lua;./?/init.lua;" .. package.path
local removed = {}
local mounted, loaded = 0, 0
love = { filesystem = {} }
function love.filesystem.read(path)
  if path == "updates/pending.txt" then return "gen1recomp-9.9.9.love\n" end
  error("unexpected read: " .. tostring(path))
end
function love.filesystem.getInfo(path, kind)
  if path == "updates/pending.txt" and kind == "file" then return { type = "file" } end
  if path == "updates" and kind == "directory" then return { type = "directory" } end
end
function love.filesystem.getDirectoryItems(path)
  assert(path == "updates")
  return { "gen1recomp-2.0.0.love", "notes.txt", "gen1recomp-unsafe/name.love" }
end
function love.filesystem.remove(path) removed[path] = (removed[path] or 0) + 1; return true end
function love.filesystem.mount(...) mounted = mounted + 1; error("mount must never run") end
function love.filesystem.load(...) loaded = loaded + 1; error("load must never run") end

local Boot = require("src.update.Boot")
local probe, reason = Boot.probePayload("updates/gen1recomp-9.9.9.love")
assert(probe == nil and tostring(reason):match("disabled"), "payload probe was not disabled")
local chosen, stale = Boot.select({
  { name = "gen1recomp-0.1.79.love", engine = "0.1.79", minShell = 1 },
  { name = "gen1recomp-0.1.80.love", engine = "0.1.80", minShell = 99 },
}, "0.1.78", 1)
assert(chosen == "gen1recomp-0.1.79.love" and #stale == 0, "pure selector compatibility changed")
assert(Boot.run({}) == false, "host-owned update policy must continue into the selected immutable core")
assert(mounted == 0 and loaded == 0, "writable payload execution primitive was called")
assert(removed["updates/pending.txt"] == 1, "pending marker was not cleaned")
assert(removed["updates/gen1recomp-9.9.9.love"] == 1, "pending payload was not cleaned")
assert(removed["updates/gen1recomp-2.0.0.love"] == 1, "enumerated payload was not cleaned")
assert(removed["updates/notes.txt"] == nil, "unrelated update-directory file was deleted")
print("Layer-owned updater policy tests passed")
''', encoding="utf-8")
        result = subprocess.run(
            [str(lua), str(harness)], cwd=work, capture_output=True, text=True, check=False
        )
        if result.returncode != 0:
            raise SystemExit(
                f"Lua 5.1 updater policy regression failed ({result.returncode}):\n"
                f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
            )
        print(result.stdout.strip())


if __name__ == "__main__":
    main()
