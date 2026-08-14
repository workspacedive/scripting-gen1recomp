#!/usr/bin/env python3
"""Verify the immutable-core and executable source-layer boundary."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "config" / "compatibility-pack.json").read_text())
assert manifest["schema"] == 2
assert manifest["id"] == "gen1recomp-execution-layer"
assert manifest["enginePatchRevision"] == 9
assert manifest["upstreamCore"]["immutable"] is True
assert manifest["requiredCapabilities"]["threads"] is False
assert manifest["requiredCapabilities"]["chunkTransport"] == 1
assert manifest["requiredCapabilities"]["executionLayer"] == 1

core_path = ROOT / "runtime" / manifest["upstreamCore"]["file"]
layer_path = ROOT / "runtime" / manifest["executionLayer"]["file"]
core_before = core_path.read_bytes()
assert len(core_before) == manifest["upstreamCore"]["bytes"]
assert hashlib.sha256(core_before).hexdigest() == manifest["upstreamCore"]["sha256"]
assert hashlib.sha256(layer_path.read_bytes()).hexdigest() == manifest["executionLayer"]["sha256"]
assert manifest["executionLayer"]["coreSha256"] == manifest["upstreamCore"]["sha256"]

with ZipFile(core_path) as archive:
    assert archive.testzip() is None
    core = {item.filename: archive.read(item.filename) for item in archive.infolist() if not item.is_dir()}
with ZipFile(layer_path) as archive:
    assert archive.testzip() is None
    layer = {item.filename: archive.read(item.filename) for item in archive.infolist() if not item.is_dir()}

layer_contract = json.loads(layer["layer-manifest.json"])
assert layer_contract["schema"] == 1
assert layer_contract["id"] == manifest["id"]
assert layer_contract["version"] == manifest["version"]
assert layer_contract["enginePatchRevision"] == manifest["enginePatchRevision"]
assert layer_contract["upstreamCore"]["sha256"] == manifest["upstreamCore"]["sha256"]
assert layer_contract["upstreamCore"]["bytes"] == len(core_before)
assert layer_contract["execution"]["coreMount"] == "verified-memory-appended"
assert layer_contract["execution"]["saveIdentity"] == "appended-non-executable"
assert layer_contract["execution"]["updater"] == "host-verified-components-only"
assert layer_contract["build"]["deterministic"] is True
assert manifest["updatePolicy"]["independentLayerImport"] is True
assert manifest["requiredCapabilities"]["hostVerifiedUpdates"] == 1
for item in layer_contract["files"]:
    assert len(layer[item["path"]]) == item["bytes"]
    assert hashlib.sha256(layer[item["path"]]).hexdigest() == item["sha256"]

physical = {
    "main.lua", "conf.lua", "compat/core-main.lua", "compat/core-conf.lua",
    "layer-manifest.json", "bit.lua", "src/mods/Loader.lua",
    "src/core/SaveData.lua", "src/mods/AssetTransform.lua",
    "src/debug/SwitchDiagnostics.lua", "src/import/CacheFs.lua",
    "src/core/TouchControls.lua", "src/core/Music.lua",
    "src/update/Boot.lua",
}
assert set(layer) == physical
assert "src/core/Version.lua" not in layer
assert all(payload != core_before for payload in layer.values())

# Build the effective read view without changing or reconstructing the core.
# main/conf are explicit brokers; their compatibility variants represent the
# corresponding upstream target while all other paths shadow in place.
effective = dict(core)
effective["main.lua"] = layer["compat/core-main.lua"]
effective["conf.lua"] = layer["compat/core-conf.lua"]
for path, payload in layer.items():
    if path.startswith("src/") or path == "bit.lua":
        effective[path] = payload

changed = {path for path in core.keys() | effective.keys() if core.get(path) != effective.get(path)}
declared = {rule["target"] for rule in manifest["rules"]}
assert changed == declared, f"layer rules do not exactly cover effective paths: {sorted(changed ^ declared)}"
assert set(effective) == set(core) | {"bit.lua"}
for path in set(core) - changed:
    assert effective[path] == core[path], f"unchanged upstream byte changed: {path}"

conf_bootstrap = layer["conf.lua"].decode()
main_broker = layer["main.lua"].decode()
core_main = layer["compat/core-main.lua"].decode()
assert 'corePath = "/gen1recomp-core.love"' in conf_bootstrap
assert 'dataModule.hash("sha256", core)' in conf_bootstrap
assert 'love.filesystem.mount(coreFile, "", true)' in conf_bootstrap
assert "t.appendidentity = true" in conf_bootstrap
assert "compat/core-conf.lua" in conf_bootstrap
assert "getSaveDirectory" in main_broker and "untrusted writable path" in main_broker
assert "compat/core-main.lua" in main_broker
update_boot = layer["src/update/Boot.lua"].decode()
assert "writable updater payload execution is disabled" in update_boot
assert "love.filesystem.mount" not in update_boot
assert "love.filesystem.load" not in update_boot
assert "loadstring" not in update_boot
assert '"src/update/Boot.lua"' in main_broker
assert "rewritePotatoVoxel144WebGuards" in core_main
assert "SpriteBillboards.lua" in core_main
assert "OverworldBattle.lua" in core_main
assert "VoxelScene.lua" in core_main

# The immutable core is not allowed to absorb suite markers or user payloads,
# and generation/inspection above must not alter its archive bytes.
for marker in (b"native-mod-packages", b"GEN1RECOMP_LUA51_SOURCE", b"native_mod_options.json", b"gen1-layer"):
    assert all(marker not in payload for payload in core.values())
for path in core:
    assert not path.lower().endswith((".gb", ".gbc", ".sav", ".state", ".ipa"))
assert core_path.read_bytes() == core_before
assert hashlib.sha256(core_path.read_bytes()).hexdigest() == manifest["upstreamCore"]["sha256"]

print(
    f"Execution-layer boundary tests passed: {len(core)} immutable core files, "
    f"{len(layer)} layer files, {len(changed)} declared effective targets"
)
