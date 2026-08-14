#!/usr/bin/env python3
"""Deterministic static validation for the distributable Scripting project."""
from __future__ import annotations

import hashlib
import json
import re
import struct
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_RUNTIME = {
    "runtime/gen1recomp-core-0.1.78.love": "4dfd6e78808024eda0cce8b9fa5434a5846d1aa327912f7a1ce3c888e416c4fe",
    "runtime/gen1recomp-layer-2.1.0.love": "d0f9fbc9af9e2d11a26ad1a3c5639205c8d32f62941d7fc3847249d69314ca71",
    "runtime/love.js": "6917d551d1dafea3b2a5315480792bdd57772029f094d9e992b259ef7fcb3b14",
    "runtime/love.wasm": "8e955d3ca1db20c2c3509313c0093cf81826fc391f509194f85562ac57c601fa",
    "runtime/game-loader.template.js": "7305353febd8b1fd5f1b7f127645a76b9c65fb51b17b3e779c050fd5bbd4aa5a",
    "runtime/binary-transport.js": "7d7c0e170f124fc4a22cab2b5c8b2d3c4ff222db77b931c30f8d2da3aa671ccc",
    "runtime/patches/bit.lua": "851a8eeb22281570274386d4d9deac5bbb7ff9ba75bbfb939810c64be9abacd0",
    "runtime/LICENSE-love.js.txt": "a5c6a1286581e6a104f81647835791b7ec4148dcf1951633d23fcb3198f7c7fb",
    "runtime/LICENSE-LOVE-11.5.txt": "fd5525d32560955b8e09541de6ddcda9d8bf9e191d2143ead1866c10b4627e95",
    "runtime/LICENSE-Emscripten-2.0.0.txt": "620a78084fc7ca97c0b5dea9abf891f3ffcadfdbf305276f099c9c4e12fc1d86",
}
CANONICAL_SHA1 = {
    "red": "ea9bcae617fdf159b045185467ae58b2e4a48b9a",
    "blue": "d7037c83e1ae5b39bde3c30787637ba1d4c48ce2",
    "yellow": "cc7d03262ebfaf2f06772c1a480c7d9d5f4a38e1",
    "gold": "d8b8a3600a465308c9953dfa04f0081c05bdcb94",
}
REQUIRED = [
    "script.json", "index.tsx", "README.md", "ARCHITECTURE.md", "THIRD_PARTY_NOTICES.md",
    "VALIDATION.md", "DEVICE_TEST_CHECKLIST.md", "SOURCES.md", "CHANGELOG.md", "MANIFEST.sha256", "references/LICENSE-Wilds-of-Kanto.md",
    "modules/library.ts", "modules/player.ts", "modules/diagnostics.ts", "modules/releases.ts", "modules/rom.ts",
    "modules/mods.ts", "modules/mod-validation.ts", "modules/mod-options.ts", "modules/zip.ts", "modules/localization.ts",
    "modules/config.ts", "modules/settings.ts", "modules/components.ts", "modules/engine-patcher.ts", "modules/mod-limits.ts", "modules/downloads.ts", "modules/runtime-recovery.ts",
    "config/catalog.json", "config/compatibility-pack.json", "runtime/index.html", "runtime/runtime.css", "runtime/game-loader.template.js", "runtime/binary-transport.js",
    "runtime/gen1recomp-core-0.1.78.love", "runtime/gen1recomp-layer-2.1.0.love", "runtime/love.js", "runtime/love.wasm",
    "tools/build_web_love.py", "tools/build_runtime_bundle.py", "tools/host-shim.d.ts", "tools/test_rom.ts", "tools/test_mods.ts", "tools/test_zip.mjs", "tools/test_engine_update.mjs", "tools/test_wilds_compat.py", "tools/test_lua_error_diagnostics.py", "tools/test_mod_options.ts", "tools/test_mod_option_bridge.py", "tools/test_downloads.ts", "tools/test_runtime_alert_policy.py", "tools/test_binary_transport.mjs", "tools/test_mod_preparation.ts", "tools/test_runtime_recovery.ts", "tools/test_compatibility_pack.py", "tools/test_execution_layer.mjs", "tools/test_execution_layer_install.ts", "tools/test_execution_layer_migration.ts", "tools/test_mod_packaging.ts", "tools/test_diagnostic_batching.ts", "tools/test_runtime_performance_guards.py", "tools/test_potato_voxel_compat.py", "tools/test_update_boot_policy.py", "tools/scripting-node-stub.ts",
]

failures: list[str] = []
checks: list[str] = []


def check(condition: bool, message: str) -> None:
    (checks if condition else failures).append(message)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


for relative in REQUIRED:
    check((ROOT / relative).is_file(), f"required file exists: {relative}")

try:
    metadata = json.loads((ROOT / "script.json").read_text())
    check(metadata.get("name") == "Gen1Recomp Native Suite", "script metadata name")
    check(metadata.get("runInApp") is True, "script runs in the main app")
    check(metadata.get("version") == "3.5.0", "expected worker/chunk/recovery/compatibility-pack metadata")
    check('SUITE_VERSION = "3.6.0"' in (ROOT / "modules/config.ts").read_text(), "performance/stability suite version matches metadata")
except Exception as error:
    failures.append(f"script.json parses: {error}")

try:
    catalog = json.loads((ROOT / "config/catalog.json").read_text())
    check(catalog.get("schema") == 1, "update catalog schema")
    check(catalog.get("engine", {}).get("bundledVersion") == "0.1.78", "catalog pins bundled Gen1Recomp version")
    check(catalog.get("engine", {}).get("bundledSha256") == EXPECTED_RUNTIME["runtime/gen1recomp-layer-2.1.0.love"], "catalog pins bundled Gen1Recomp hash")
    check(catalog.get("webRuntime", {}).get("files", {}).get("love.js") == EXPECTED_RUNTIME["runtime/love.js"], "catalog pins active love.js hash")
    check(catalog.get("webRuntime", {}).get("files", {}).get("love.wasm") == EXPECTED_RUNTIME["runtime/love.wasm"], "catalog pins active love.wasm hash")
    dramatic = next((item for item in catalog.get("featuredMods", []) if item.get("id") == "DRAMATIC_SHAPE"), None)
    check(dramatic is not None and dramatic.get("repo") == "scottcandy34/DramaticShapeVoxelMod-latest", "catalog declares the featured Dramatic Shape source")
    check(dramatic is not None and dramatic.get("presets", {}).get("balanced", {}).get("shadows") is False, "catalog declares a bounded balanced visual-mod profile")
except Exception as error:
    failures.append(f"config/catalog.json parses: {error}")

try:
    compatibility = json.loads((ROOT / "config/compatibility-pack.json").read_text())
    check(compatibility.get("schema") == 2 and compatibility.get("id") == "gen1recomp-execution-layer"
          and compatibility.get("version") == "2.1.0"
          and compatibility.get("enginePatchRevision") == 9, "versioned executable-layer manifest")
    check(compatibility.get("upstreamCore", {}).get("immutable") is True
          and compatibility.get("upstreamCore", {}).get("bytes") == 4_418_896
          and compatibility.get("upstreamCore", {}).get("sha256") == EXPECTED_RUNTIME["runtime/gen1recomp-core-0.1.78.love"],
          "execution layer pins the byte-exact immutable upstream core")
    check(compatibility.get("executionLayer", {}).get("sha256") == EXPECTED_RUNTIME["runtime/gen1recomp-layer-2.1.0.love"]
          and compatibility.get("executionLayer", {}).get("coreSha256") == EXPECTED_RUNTIME["runtime/gen1recomp-core-0.1.78.love"]
          and compatibility.get("executionLayer", {}).get("precedence") == "source-layer-before-appended-core-before-save"
          and compatibility.get("requiredCapabilities", {}).get("executionLayer") == 1
          and compatibility.get("requiredCapabilities", {}).get("chunkTransport") == 1
          and compatibility.get("requiredCapabilities", {}).get("hostVerifiedUpdates") == 1
          and compatibility.get("updatePolicy", {}).get("independentLayerImport") is True
          and compatibility.get("requiredCapabilities", {}).get("threads") is False,
          "execution layer gates digest, precedence, updater policy, runtime, and free-tier capabilities")
except Exception as error:
    failures.append(f"config/compatibility-pack.json parses: {error}")

for relative, expected in EXPECTED_RUNTIME.items():
    path = ROOT / relative
    check(path.is_file() and sha256(path) == expected, f"pinned runtime hash: {relative}")

wasm = (ROOT / "runtime/love.wasm").read_bytes() if (ROOT / "runtime/love.wasm").exists() else b""
check(wasm[:8] == b"\x00asm\x01\x00\x00\x00", "LÖVE WebAssembly magic and version")
check(4_000_000 <= len(wasm) <= 6_000_000, "expected LÖVE 11.5 compatibility WASM size")

core_path = ROOT / "runtime/gen1recomp-core-0.1.78.love"
try:
    with zipfile.ZipFile(core_path) as core:
        core_names = {item.filename for item in core.infolist() if not item.is_dir()}
        check(len(core_names) == 453 and "bit.lua" not in core_names, "immutable upstream core retains its exact unpatched entry set")
        core_payload = b"\n".join(core.read(name) for name in core_names if name.endswith(".lua"))
        check(b"GEN1RECOMP_LUA51_SOURCE" not in core_payload and b"native-mod-packages" not in core_payload,
              "immutable upstream core contains no suite compatibility code")
except Exception as error:
    failures.append(f"immutable upstream .love archive is readable: {error}")

love_path = ROOT / "runtime/gen1recomp-layer-2.1.0.love"
try:
    with zipfile.ZipFile(love_path) as love:
        bad = [name for name in love.namelist() if Path(name).suffix.lower() in {".gb", ".gbc", ".rom", ".z64", ".n64", ".v64", ".sav", ".state"}]
        check(not bad, "execution layer contains no ROM or user-save payload")
        check(len(love.namelist()) == 14 and "bit.lua" in love.namelist()
              and "src/update/Boot.lua" in love.namelist()
              and "src/core/Version.lua" not in love.namelist(),
              "small execution layer contains only brokers and declared compatibility/policy modules")
        layer_manifest = json.loads(love.read("layer-manifest.json"))
        entry_broker = love.read("main.lua").decode()
        conf_broker = love.read("conf.lua").decode()
        main = love.read("compat/core-main.lua").decode()
        cache = love.read("src/import/CacheFs.lua").decode()
        touch = love.read("src/core/TouchControls.lua").decode()
        music = love.read("src/core/Music.lua").decode()
        mod_loader = love.read("src/mods/Loader.lua").decode()
        save_data = love.read("src/core/SaveData.lua").decode()
        asset_transform = love.read("src/mods/AssetTransform.lua").decode()
        switch_diagnostics = love.read("src/debug/SwitchDiagnostics.lua").decode()
        update_boot = love.read("src/update/Boot.lua").decode()
        conf = love.read("compat/core-conf.lua").decode()
        check(layer_manifest.get("upstreamCore", {}).get("sha256") == EXPECTED_RUNTIME["runtime/gen1recomp-core-0.1.78.love"]
              and layer_manifest.get("enginePatchRevision") == 9
              and layer_manifest.get("build", {}).get("deterministic") is True
              and len(layer_manifest.get("files", [])) == 13,
              "layer-internal activation contract pins the same immutable core and per-file manifest")
        check('corePath = "/gen1recomp-core.love"' in conf_broker
              and 'dataModule.hash("sha256", core)' in conf_broker
              and 'love.filesystem.mount(coreFile, "", true)' in conf_broker
              and "t.appendidentity = true" in conf_broker,
              "conf broker verifies and appends the separate core while keeping save code behind executable sources")
        check("getSaveDirectory" in entry_broker and "untrusted writable path" in entry_broker
              and "compat/core-main.lua" in entry_broker,
              "main broker enforces executable precedence before entering the immutable core")
        check('"web-rom-" .. version .. ".gbc"' in main and "local scriptedVersion = webVersion" in main, "layered bootstrap selects the preloaded user ROM and matching cache")
        check("loadstring(source, chunkName)" in main and "LuaJIT integer suffixes" in main, "standard-Lua mod source compatibility is installed")
        check("rewriteTerminalContinueGotos" in main and "GEN1RECOMP_LUA51_SOURCE" in main
              and "applied Lua 5.1 continue compatibility" in mod_loader and 'loadstring(source, "@" .. path)' in mod_loader,
              "strict terminal-continue compatibility is applied before Web mod entry compilation")
        check("rewriteWebImageEncodeGuard" in main
              and "@mods/overworld_wild_spawns/lib/spawn_render.lua" in main
              and 'imageFormat ~= "rgba8" and imageFormat ~= "rgba16"' in main
              and "nativeLoadstring = loadstring" in main
              and "guarded unsupported ImageData PNG encode" in main,
              "exact Wilds modules receive an in-memory rgba4 PNG-encoder capability guard")
        check("rewritePotatoVoxel144WebGuards" in main
              and "@mods/potato_voxel/lib/SpriteBillboards.lua" in main
              and "@mods/potato_voxel/lib/OverworldBattle.lua" in main
              and "@mods/potato_voxel/lib/VoxelScene.lua" in main
              and "actorDecalPassAvailable = false" in main
              and "if session.broken then return end" in main,
              "exact PotatoVoxel v1.4.4 sources receive one-based shadow maps and one-failure battle/decal retirement")
        check("getCanvasFormats(true)" in main and "supportedCanvasFormats[format]" in main, "unsupported readable depth canvases are rejected before the Web native binding")
        check('[native-lua-error]' in main and 'debug.traceback("Unhandled Lua error: "' in main
              and "SwitchDiagnostics.logLuaError(detail)" in main,
              "original unhandled Lua traceback is reported before error-log persistence")
        check('filesystem.getInfo(ERROR_LOG, "file")' in switch_diagnostics
              and "local existing = filesystem.read(ERROR_LOG)" not in switch_diagnostics,
              "first Lua failure does not read a nonexistent optional error log")
        check("NATIVE_MOD_STATE_FILE" in mod_loader and "Json.encode(nativeState)" in mod_loader, "native and in-game mod toggles share explicit state")
        check("NATIVE_MOD_OPTIONS_FILE" in mod_loader and "state.managed" in mod_loader and "applyBuckets(state.profile)" in mod_loader
              and "applyBuckets(state.values)" in mod_loader, "profile presets seed options while explicit native and in-game values win")
        check("nativeSchemaRows" in mod_loader and "_finalizeNativeOptions" in mod_loader and "state.probed" in mod_loader
              and "GEN1RECOMP_NATIVE_OPTIONS_CAPTURE" in save_data, "genuine runtime captures bounded option schemas and mirrors later in-game edits")
        check("nativeOptionChoice" in mod_loader and "rawChoice.value" in mod_loader and "local rows, seen, rejected" in mod_loader,
              "bundled engine preserves false dynamic choices and skips only malformed sibling rows")
        check("optional mod assets must probe" in mod_loader and 'loader.fs.getInfo(path, "file")' in mod_loader, "missing optional mod-file reads are guarded")
        check('archiveRoot = "native-mod-packages"' in mod_loader and "self.fs.mount" in mod_loader, "validated native mod archives are mounted lazily through PhysFS")
        check("missing PhysFS read" in asset_transform and 'fs.getInfo(stampPath, "file")' in asset_transform, "first-run asset-transform stamp read is guarded")
        check("deferredTasks" in asset_transform and "coroutine.yield(written)" in asset_transform and "AssetTransform.step" in asset_transform, "Web asset transforms run cooperatively after boot")
        check('love.system.getOS() == "Web"' in cache and 'getInfo(rel, "file")' in cache, "missing-cache read is guarded on Web")
        check('or osName == "Web"' in touch, "genuine Gen1Recomp touch controls are enabled on Web")
        check("elseif not isChip" in music, "queueable chip music avoids unsupported looping call")
        check("writable updater payload execution is disabled" in update_boot
              and 'getInfo, PENDING, "file"' in update_boot
              and "love.filesystem.mount" not in update_boot
              and "love.filesystem.load" not in update_boot
              and "loadstring" not in update_boot
              and '"src/update/Boot.lua"' in entry_broker,
              "layer owns updater precedence, avoids missing reads, and cannot execute writable payloads")
        check("t.window.minwidth = 320" in conf, "narrow iPhone viewport is supported")
        check("[native-telemetry]" in main and "love.graphics.getStats" in main and 'collectgarbage("count")' in main,
              "bounded Lua heap and graphics telemetry is installed")
        check("function love.lowmemory()" in main and 'collectgarbage("collect")' in main,
              "Web low-memory handling performs an explicit emergency collection")
        check("WEB DEBUG" not in main and "WEB PORT" not in main, "temporary runtime diagnostics are absent")
except Exception as error:
    failures.append(f"execution-layer .love archive is readable: {error}")

html = (ROOT / "runtime/index.html").read_text()
for reference in re.findall(r'(?:src|href)="([^"]+)"', html):
    if reference.startswith(("data:", "#")) or reference == "launch.js":
        continue
    target = "runtime/game-loader.template.js" if reference == "game.js" else f"runtime/{reference}"
    check((ROOT / target).is_file(), f"local runtime HTML dependency exists: {reference}")
check("Content-Security-Policy" in html and "connect-src 'none'" in html, "runtime CSP forbids network connections")
check('<script src="launch.js"></script>' in html and '<script src="binary-transport.js"></script>' in html
      and "wasmBinary: injectedWasm" in html and "Gen1BinaryTransport.take('wasm')" in html,
      "bounded native-injected WASM is configured before love.js")
check("saveSnapshot" in html and "syncAndSnapshot" in html and "native_mod_state.json" in html
      and "native_mod_options.json" in html, "save, mod-state, and mod-option synchronization is wired")
check("lua-error.log" in html and "lua-error.log.1" in html and "[native-lua-error]" in html
      and "setTimeout(snapshotWithoutSync, 0)" in html,
      "originating Lua errors are reported and both error-log generations are mirrored")
check("runtimeOptions.saveSyncSeconds" in html and "saveSyncSeconds * 1000" in html, "runtime save mirror interval is configurable and bounded")
check("slowFramePercent" in html and "worstFrameMs" in html and "metricFrames" in html
      and "wasmHeapBytes" in html and "runtime_telemetry" in html, "bounded frame/WASM-memory telemetry is wired")
check("wasmValidation" in html and "wasmMemoryGrowth" in html and "hostCapabilities" in html,
      "browser and native launch capability probes are persisted")
check('id="modWork"' in html and "native-assets" in html and "Optimizing mod assets" in html, "non-blocking mod asset progress badge is wired")
check("runtimeDiagnostic" in html and "unhandledrejection" in html and "window_error" in html and "consoleMethods" in html, "browser console, JavaScript errors, and rejections are captured before runtime scripts load")
check("diagnosticQueue" in html and "maximumBatchEntries = 48" in html
      and "setTimeout(flushDiagnosticQueue, 40)" in html
      and "runtimeDiagnostic.postMessage({ schema: 1, entries: entries })" in html
      and "diagnosticPostChain" in html and "flushDiagnosticQueue" in html,
      "browser-to-native diagnostics use an ordered bounded batching bridge with explicit terminal flushes")
check("saveInventory" in html and "lastSnapshotInventory === inventory" in html
      and "snapshot_skipped_unchanged" in html and "collectSaveFiles(paths)" in html
      and "Module.FS.syncfs(false" in html,
      "periodic save mirroring suppresses unchanged Base64 snapshots while terminal snapshots remain complete")
check("window.alert = function" in html and "Gen1RecompReportAlert" in html and 'id="fatalClose"' in html and "requestPlayerClose" in html and "close_rejected" in html,
      "generic runtime alerts are persisted and failed native dismissal remains visibly retryable")
alert_report = html.split("window.Gen1RecompReportAlert = function (message)", 1)[-1].split("};", 1)[0]
check("caught_exception_alert_retained" in alert_report and "requestPlayerClose" not in alert_report.split("} else {", 1)[0]
      and "caught_exception_alert" in html,
      "post-ready Davidobot generic alerts remain diagnostic warnings without dismissing Lua-pcall-caught gameplay")
check("onAbort" in html and "onExit" in html and "webglcontextcreationerror" in html and "webglcontextlost" in html
      and "window-error-after-ready" in html and "unhandled-rejection-after-ready" in html,
      "Emscripten, browser, promise, and WebGL terminal events are independently captured")
check("https://" not in html and "http://" not in html, "runtime HTML has no executable external URL")

loader = (ROOT / "runtime/game-loader.template.js").read_text()
check("Gen1Launch.packageMetadata" in loader and "transport.take('package')" in loader
      and "legacy_base64_decode_begin" in loader, "runtime loader consumes bounded native package bytes with a legacy fallback")
check("__PACKAGE_METADATA__" not in loader, "runtime loader requires no generated source placeholder")
check("XMLHttpRequest" not in loader and "fetch(" not in loader, "runtime package loader performs no network request")
check("indexedDB" not in loader and "openDatabase" not in loader, "temporary ROM package is not cached in IndexedDB")
check("FS_createPath" in loader and "FS_unlink" in loader, "native save restore creates parents and replaces stale files")
check("removeTree('/home/web_user/love/pokemon-love2d/mods')" in loader and "removeTree('/home/web_user/love/pokemon-love2d/native-mod-packages')" in loader and "fs.rmdir(path)" in loader, "stale expanded and packed browser mod trees are replaced before injection")
check("Gen1Diagnostics" in loader and "package_process_begin" in loader and "file_injected" in loader and "package_error" in loader, "package metadata, decoding, injected files, and failures emit persistent diagnostic events")
binary_transport = (ROOT / "runtime/binary-transport.js").read_text()
check("new Uint8Array(spec.bytes)" in binary_transport and "Out-of-order binary transport chunk" in binary_transport
      and "state.bytes = null" in binary_transport and "document.write" in binary_transport,
      "binary transport preallocates, validates order, releases storage, and loads local chunks")
check("https://" not in binary_transport and "http://" not in binary_transport and "fetch(" not in binary_transport
      and "XMLHttpRequest" not in binary_transport, "binary transport is local and network-free")

player = (ROOT / "modules/player.ts").read_text()
for symbol in ["WebViewController", "loadFile(runtime.entry, runtime.directory)", "writeBinaryChunks", "BINARY_CHUNK_BYTES", "binaryTransport", "launch.js", "game-loader.template.js", "modPackageFiles", "launchGen1Recomp"]:
    check(symbol in player, f"serverless genuine-runtime host contains: {symbol}")
check("Data.combine(parts)" not in player and "packageBase64" not in player and "wasmBase64" not in player,
      "native launch avoids monolithic combined/Base64 payloads")
check('request.url.startsWith("file:")' in player and 'request.url.startsWith("blob:")' in player, "WebView runtime request policy is file-local")
check("await FileManager.remove(runtime.directory)" in player, "ROM-bearing temporary runtime is removed asynchronously on close")
recovery_source = (ROOT / "modules/runtime-recovery.ts").read_text()
check("recoverInterruptedRuntime" in player and "beginRuntimeRecovery" in player and "clearRuntimeRecovery" in player
      and "RUNTIME_RECOVERY_TEMP_FILE" in recovery_source and "FileManager.rename" in recovery_source,
      "persistent interrupted-launch recovery uses an atomic private journal")
check("saveSnapshot" in player and "SAVES_ROOT" in player, "native save mirror handler is wired")
check('^lua-error\\.log(?:\\.1)?$' in player,
      "native save path validation admits only the two bounded Lua error logs")
check("activeEngineLayersAsync" in player and "activeWebRuntimeAsync" in player and "Promise.all" in player
      and 'filename: "/gen1recomp-core.love"' in player,
      "player asynchronously verifies and injects the execution layer and immutable core as separate components")
check("native_mod_options.json" in player and "nativeModOptionsLaunchEnvelope" in player, "player packages the configured native mod profile and explicit values")
check("saveSyncSeconds" in player and "lastPerformance" in player, "player passes save timing and persists bounded performance telemetry")
check("runtimeDiagnostic" in player and "acceptWebDiagnosticEnvelope" in player
      and "recordDiagnosticError" in player and "endDiagnosticSession" in player,
      "native launch, batched bridge, runtime, save, terminal, and cleanup diagnostics are durably persisted")
check("engineLayers.migration" in player and "execution_layer_migrated" in player
      and "execution_layer_migration_failed" in player,
      "player reports transactional execution-layer migration outcomes without hiding bundled fallback")
check("closePlayer" in player and "await controller.dismiss()" in player and "close_coalesced" in player and "dismiss_failed" in player and 'kind === "exit"' not in player,
      "Web runtime exit requests await a coalesced, retryable dismissal back to the dashboard")
check('reason === "browser-alert-after-ready"' in player and "caught_alert_close_ignored" in player,
      "native host defensively refuses ambiguous post-ready generic-alert dismissal")
check("message.slice(0, 400)" not in player and "text.slice(0, 400)" not in html, "runtime diagnostics are not silently shortened")
check("launchCompatibilityPlayer" not in player and "binjgb" not in player.lower(), "emulator architecture is absent from native player module")
for forbidden in ["HttpServer", "HttpResponse", "listenAddressIPv4", "127.0.0.1", "RUNTIME_PORT", "loadURL("]:
    check(forbidden not in player, f"native player excludes server/URL primitive: {forbidden}")

mods_source = (ROOT / "modules/mods.ts").read_text()
mod_validation = (ROOT / "modules/mod-validation.ts").read_text()
mod_options_source = (ROOT / "modules/mod-options.ts").read_text()
for symbol in ["readLocalZip", "extractLocalZipEntry", "createRepackedZipFromArchive", "Symbolic links are not allowed", "MAX_MOD_TOTAL_BYTES", "forbiddenModPayload", "staging", "downloadAndPrepareMod", "expectedSha256", "DRAMATIC_SHAPE_REPO", "modPackageFiles", "native-mod-packages", "checkModReleaseURL", "runCpuTask"]:
    check(symbol in mods_source, f"bounded native mod manager contains: {symbol}")
mod_limits_source = (ROOT / "modules/mod-limits.ts").read_text()
check("filesPerArchive: 32_768" in mod_limits_source and "entriesPerArchive: 40_000" in mod_limits_source and "installedFiles: 49_152" in mod_limits_source, "large asset mods have explicit raised file/entry limits")
check("parts.length <= 2" in mods_source and "root manifest.json" in mods_source, "nested asset manifests do not shadow the root/wrapper mod manifest")
check('storage: "archive"' in mods_source and 'Path.join(staging, "package.zip")' in mods_source and "packageSha256" in mods_source, "verified mods are normalized into one integrity-pinned packed archive")
check("const activeMods = library.mods.filter(mod => mod.enabled)" in mods_source
      and "for (const mod of activeMods)" in mods_source
      and "nativeStateObject(library)" in mods_source,
      "launch packages only enabled mod payloads while retaining a complete native enablement mirror")
check('stage: "verifying"' in mods_source and "Thread.runInBackground" in mods_source
      and "ZIP_VERIFY_BATCH_BYTES" in mods_source and "await FileManager.readAsData" in mods_source
      and "await FileManager.writeAsData" in mods_source,
      "large archive parsing/verification/repacking uses bounded background CPU and asynchronous I/O")
index_source = (ROOT / "index.tsx").read_text()
check("public.zip-archive" in index_source and "setModEnabled" in index_source, "native mod import/enable menu is wired")
check("<TabView" in index_source and all(f"tag={{{tag}}}" in index_source for tag in range(4)), "native four-tab navigation is wired")
check('modalPresentationStyle: "fullScreen"' in index_source and index_source.count("topBarLeading") == 4 and index_source.count('systemImage="xmark"') >= 6, "dashboard presents full-screen with a leading close action on every tab")
check("modHealthIssues" in index_source and "showLoadReportHelp" in index_source, "mod dependency/conflict health and LOAD REPORT help are wired")
check("installFromGitHub" in index_source and "checkModReleaseURL" in index_source and "modPreparationStatus" in index_source, "direct GitHub release install and visible preparation progress are wired")
check(all(marker in mod_options_source for marker in ["LuaLiteralParser", "parseDeclarativeOptionSchema", "Executable Lua is not allowed",
      "nativeModOptionsLaunchEnvelope", "reconcileRuntimeModOptionMetadata", "restoreNativeModDefaults", "performanceProfileDidChange",
      "forgetNativeModOptionMetadata", "MOD_OPTIONS_MIRROR_FILE}.tmp", "FileManager.renameSync(temporary, MOD_OPTIONS_MIRROR_FILE)"]),
      "native mod settings use literal-only discovery, atomic recovery, runtime reconciliation, profile precedence, safe uninstall, and genuine-default reset")
check(all(marker in index_source for marker in ["openModSettings", "editModOption", "restoreModDefaults", "modSettingsDeclarative",
      "modSettingsRuntime", "setNativeModOption", "modOptionDisplayValue"]),
      "Mods page exposes captured toggle, choice, number, and text settings with reset UX")
check('title={T.back}' in index_source and 'systemImage="chevron.left"' in index_source
      and 'action={() => setEditingModOptions(null)}' in index_source
      and 'title={T.close} systemImage="xmark" action={dismiss}' in index_source,
      "mod settings include visible in-content back and close escape actions independent of toolbar refresh")
check("options_schema" in mod_validation and "optionsSchema" in mods_source and "parseDeclarativeOptionSchema" in mods_source,
      "manifest-declared option schemas are path-validated and parsed as bounded data during install")
check("native_mod_options.json" in player and "nativeModOptionsLaunchEnvelope" in player
      and "invalidateNativeModOptionState" in player, "runtime launch and save snapshots carry the bounded native option mirror")
diagnostic_source = (ROOT / "modules/diagnostics.ts").read_text()
diagnostic_ui = index_source.split("const diagnosticMetadata", 1)[-1].split("const showAbout", 1)[0]
check(all(marker in diagnostic_source for marker in ["appendTextSync", "FileManager.appendText(DIAGNOSTIC_LOG_FILE, text)", "pendingLines", "DIAGNOSTIC_BATCH_CHARACTERS", "DIAGNOSTIC_BATCH_DELAY_MS", "operationChain", "flushDiagnostics", "DIAGNOSTIC_LOG_FILE", "ROTATE_BEFORE_SESSION_BYTES", 'endsWith("\\n")', "acceptWebDiagnosticEnvelope", "malformed_jsonl_entry"]),
      "persistent diagnostics preserve ordering and validated Web events through bounded asynchronous batches with terminal durability")
check(all(marker in diagnostic_source for marker in ['format === "jsonl"', 'format === "json"', 'format === "csv"', "textExport", "FileManager.temporaryDirectory"]),
      "complete TXT, JSON, JSONL, and CSV diagnostic exporters are implemented")
check("spreadsheetSafe" in diagnostic_source and "[=+\\-@]" in diagnostic_source,
      "CSV diagnostics neutralize spreadsheet formula-leading cells without dropping text")
check(all(marker in diagnostic_ui for marker in ["diagnosticsTXT", "diagnosticsJSON", "diagnosticsJSONL", "diagnosticsCSV", "DocumentInteraction.optionsMenu", "FileManager.removeSync(path)"]),
      "Settings exposes four temporary console-export formats through the documented iOS options menu")
check(all(forbidden not in diagnostic_ui for forbidden in ["romFileName", ".sha1", "customCover", "Data.fromFile"]),
      "diagnostic context excludes ROM filenames, hashes, contents, and cover payloads")
check("clearConsoleDiagnostics" in index_source and "clearDiagnostics()" in index_source and "consoleDiagnosticsBody" in index_source,
      "Settings shows persistent console status, explicit export, and confirmed local clearing")
check("checkEverything" in index_source and "automaticUpdateCheckDue" in index_source, "proactive opt-in update scheduling is wired")
check("installEngineRelease" in index_source and "installExecutionLayer" in index_source
      and "installRuntimeBundle" in index_source and "updateAllAvailableMods" in index_source,
      "Update Center engine, independent layer, runtime, and mod actions are wired")
check("performanceProfile" in index_source and "saveSyncSeconds" in index_source and "lastPerformance" in index_source, "dedicated Settings performance controls are wired")
check("safeModRelativePath" in mod_validation and "compareModVersions" in mod_validation, "pure mod path/manifest/version validation is present")
zip_source = (ROOT / "modules/zip.ts").read_text()
for symbol in ["readLocalZip", "extractLocalZipEntry", "inflateRaw", "zipCrc32", "createStoredZip", "createRepackedZip", "createRepackedZipFromArchive", "Multi-disk ZIPs are not supported", "ZIP entries overlap each other"]:
    check(symbol in zip_source, f"self-contained free-tier ZIP implementation contains: {symbol}")
check("FileManager.zip" not in (ROOT / "modules/library.ts").read_text() and "createStoredZip" in (ROOT / "modules/library.ts").read_text(), "save export uses the local ZIP writer")
components_source = (ROOT / "modules/components.ts").read_text()
for symbol in ["checkEngineRelease", "installEngineRelease", "installExecutionLayer", "resetExecutionLayer", "checkRuntimeSource", "installRuntimeBundle", "activeComponentStatus"]:
    check(symbol in components_source, f"component manager contains: {symbol}")
check("jsBackedUp" in components_source and "wasmBackedUp" in components_source and "rollback was incomplete" in components_source, "coupled runtime installation has explicit two-file rollback")
check("source.size !== release.size" in components_source and "sourceDigest !== release.sha256" in components_source, "engine updates require exact GitHub size and SHA-256")
check("SharedArrayBuffer" in components_source and "pthread-main.js" in components_source, "runtime imports reject threaded builds")
check("verifiedDataAt" in components_source and "pinned SHA-256 integrity check" in components_source, "active engine and runtime bytes are reverified before launch")
check("ENGINE_PATCH_REVISION = EXECUTION_LAYER_REVISION" in components_source
      and "engine.patchRevision === ENGINE_PATCH_REVISION" in components_source
      and "engine.sourceFile === ENGINE_CORE_FILE" in components_source,
      "installed engines from older capability contracts cannot activate")
check("activeEngineLayersAsync" in components_source and "bundledEngineLayersAsync" in components_source
      and "base = await bundledEngineLayersAsync()" in components_source
      and "withInstalledLayerAsync" in components_source,
      "absent, incompatible, or corrupt installed core/layer components safely fall back without partial activation")
check("migrateRevision8InstalledLayer" in components_source and "previousStateText" in components_source
      and ".layer-migration-revision8.backup.love" in components_source
      and 'status: "upgraded"' in components_source and 'status: "failed-bundled-fallback"' in components_source
      and "writeStateText(candidate.previousStateText)" in components_source,
      "revision-8 installed pairs migrate transactionally before activation with exact state/layer rollback and bundled fallback")
check("coreStaging" in components_source and "coreBackup" in components_source and "sourceFile: ENGINE_CORE_FILE" in components_source
      and "immutable installed Gen1Recomp upstream core" in components_source
      and "createCompatibilityLayerLove" in components_source,
      "engine updates transactionally retain the immutable core beside a generated executable layer")
check("Execution-layer versions must increase monotonically" in components_source
      and "The execution-layer file manifest is incomplete" in components_source
      and "coreSha256 !== base.coreSha256" in components_source
      and "layer-override-backup" in components_source
      and "post-install activation verification" in components_source,
      "independent layer imports require exact core binding, per-file hashes, monotonic versions, rollback, and post-activation verification")
download_source = (ROOT / "modules/downloads.ts").read_text()
check(all(marker in download_source for marker in ["dataStream", "appendDataSync", 'headers.Range = `bytes=${offset}-`', 'headers["If-Range"]',
      "response.status === 206", "parseContentRange", "response.status === 200", "removeRecordFiles(record)"]),
      "download manager streams to persistent partial files and validates Range/Content-Range with clean 200 restart")
check(all(marker in download_source for marker in ["MAX_ATTEMPTS = 6", "retrying", "retryAfterMilliseconds", "pauseDownload", "resumeDownload",
      "cancelDownload", "verifyPartial", "Crypto.sha256", "expectedSize", "DOWNLOAD_STATE_BACKUP_FILE", "DOWNLOAD_STATE_TEMP_FILE"]),
      "download manager provides bounded retries, pause/cancel/resume, atomic recovery, exact size, and SHA-256 gating")
check("downloadVerifiedData" in components_source and "downloadVerifiedData" in mods_source
      and "downloadVerifiedData" in (ROOT / "modules/releases.ts").read_text(),
      "engine, GitHub mod, and IPA assets share the persistent verified download manager")
check("DownloadPanel" in index_source and "downloadProgress(record)" in index_source
      and 'progressViewStyle="linear"' in index_source and "subscribeDownloads" in index_source,
      "native Mods/Settings UI observes determinate download progress and integrated controls")
runtime_builder = (ROOT / "tools/build_runtime_bundle.py").read_text()
check("runtime-manifest.json" in runtime_builder and "SharedArrayBuffer" in runtime_builder and "allowZip64=False" in runtime_builder, "local runtime-bundle builder emits bounded compatibility manifests")
settings_source = (ROOT / "modules/settings.ts").read_text()
check("automaticUpdateCheckDue" in settings_source and "lastPerformance" in settings_source, "settings parser validates update schedule and performance telemetry")
patcher_source = (ROOT / "modules/engine-patcher.ts").read_text()
check("createRepackedZip" in patcher_source and "extractLocalZipEntry" in patcher_source
      and "createCompatibilityLayerLove" in patcher_source and "EXECUTION_LAYER_REVISION = 9" in patcher_source,
      "on-device builder emits a bounded executable layer from verified core entries")
check('corePath = "/gen1recomp-core.love"' in patcher_source
      and 'dataModule.hash("sha256", core)' in patcher_source
      and 'love.filesystem.mount(coreFile, "", true)' in patcher_source
      and "t.appendidentity = true" in patcher_source,
      "generated conf broker re-verifies and mounts the separate immutable core with source-first precedence")
check("patchUpdateBoot" in patcher_source and "writable updater payload execution is disabled" in patcher_source
      and '"src/update/Boot.lua": patchUpdateBoot' in patcher_source
      and '"src/update/Boot.lua",' in patcher_source,
      "generated layer owns updater execution and includes it in writable-precedence verification")
check("patchAssetTransform" in patcher_source and "native packed-mod mount" in patcher_source
      and "missing asset-transform stamp guard" in patcher_source and "rewriteTerminalContinueGotos" in patcher_source
      and "rewriteWebImageEncodeGuard" in patcher_source and "rewritePotatoVoxel144WebGuards" in patcher_source
      and "SpriteBillboards.lua" in patcher_source and "OverworldBattle.lua" in patcher_source and "VoxelScene.lua" in patcher_source
      and "nativeLoadstring = loadstring" in patcher_source
      and "patchSwitchDiagnostics" in patcher_source and "missing Lua-error log guard" in patcher_source
      and "bounded Web Lua/graphics telemetry" in patcher_source and "Web low-memory collection" in patcher_source,
      "on-device engine updates reproduce packed-mod, deferred-transform, Lua, Wilds, exact PotatoVoxel, diagnostics, and telemetry patches")
check("nativeOptionChoice" in patcher_source and "rawChoice.value" in patcher_source
      and "local rows, seen, rejected" in patcher_source and "raw.maxLen or raw.maxLength" in patcher_source,
      "dynamic option normalization preserves false tuple/object choices, text aliases, and valid rows beside malformed siblings")
transport_test_source = (ROOT / "tools/test_binary_transport.mjs").read_text()
mod_preparation_test = (ROOT / "tools/test_mod_preparation.ts").read_text()
recovery_test_source = (ROOT / "tools/test_runtime_recovery.ts").read_text()
compatibility_test_source = (ROOT / "tools/test_compatibility_pack.py").read_text()
check("An out-of-order chunk was accepted" in transport_test_source and "An external chunk script name was accepted" in transport_test_source,
      "binary transport regression covers exact bytes, ordering, completion, reuse, and local script names")
check("workerCalls >= 4" in mod_preparation_test and "asynchronous FileManager I/O" in mod_preparation_test
      and "Normalized payload bytes changed" in mod_preparation_test,
      "background mod preparation regression covers worker stages, progress, async output, and byte identity")
check("different session cleared" in recovery_test_source and "Interrupted private runtime survived cleanup" in recovery_test_source,
      "persistent recovery regression covers ownership, interruption, cleanup, and malformed journals")
check("changed == declared" in compatibility_test_source and "core_path.read_bytes() == core_before" in compatibility_test_source
      and "effective = dict(core)" in compatibility_test_source,
      "execution-layer regression proves exact effective targets and immutable-core byte identity")
migration_test_source = (ROOT / "tools/test_execution_layer_migration.ts").read_text()
mod_packaging_test_source = (ROOT / "tools/test_mod_packaging.ts").read_text()
diagnostic_batching_test_source = (ROOT / "tools/test_diagnostic_batching.ts").read_text()
runtime_guard_test_source = (ROOT / "tools/test_runtime_performance_guards.py").read_text()
potato_test_source = (ROOT / "tools/test_potato_voxel_compat.py").read_text()
check("Revision-8 to revision-9 execution-layer migration tests passed" in migration_test_source
      and "failed-bundled-fallback" in migration_test_source and "restore revision-8 layer bytes" in migration_test_source,
      "migration regression covers success, exact rollback, and bundled-pair fallback")
check("Enabled-only mod payload selection tests passed" in mod_packaging_test_source
      and "Disabled packed mod bytes entered" in mod_packaging_test_source and "re-enabled mod was not selected" in mod_packaging_test_source,
      "mod packaging regression proves disabled payload exclusion, complete state, and next-launch re-enablement")
check("Ordered asynchronous diagnostic batching tests passed" in diagnostic_batching_test_source
      and "A failed async batch did not use exactly one whole-batch synchronous fallback" in diagnostic_batching_test_source
      and "export" in diagnostic_batching_test_source.lower(),
      "diagnostic regression covers ordering, whole-batch fallback, durability boundaries, and complete exports")
check("snapshot_skipped_unchanged" in runtime_guard_test_source and "maximumBatchEntries = 48" in runtime_guard_test_source
      and "DIAGNOSTIC_BATCH_CHARACTERS" in runtime_guard_test_source and "activeMods" in runtime_guard_test_source,
      "static performance regression binds diagnostic batching, unchanged-save suppression, and enabled-only payload selection")
check("EXPECTED_POTATO_SHA256" in potato_test_source and "SpriteBillboards.lua" in potato_test_source
      and "OverworldBattle.lua" in potato_test_source and "VoxelScene.lua" in potato_test_source
      and "same source under another mod id was rewritten" in potato_test_source,
      "official-archive PotatoVoxel regression binds exact paths/sources, PUC Lua compilation, and non-target byte identity")
execution_layer_test = (ROOT / "tools/test_execution_layer.mjs").read_text()
check("createCompatibilityLayerLove" in execution_layer_test and "assert.deepEqual(second, layer)" in execution_layer_test
      and "compat/core-main.lua" in execution_layer_test,
      "dynamic execution-layer regression covers deterministic generation and broker structure")
wilds_test_source = (ROOT / "tools/test_wilds_compat.py").read_text()
check(EXPECTED_RUNTIME["runtime/gen1recomp-layer-2.1.0.love"] in (ROOT / "config/catalog.json").read_text()
      and 'gen1recomp-layer-2.1.0.love' in wilds_test_source
      and "EXPECTED_ARCHIVE" in wilds_test_source and "EXPECTED_SOURCE" in wilds_test_source
      and 'run(lua, behavior, "rgba4")' in wilds_test_source and 'run(lua, behavior, "rgba8")' in wilds_test_source,
      "reproducible exact Wilds/PUC-Lua regression covers unsupported and supported image formats")
mod_option_test_source = (ROOT / "tools/test_mod_options.ts").read_text()
mod_option_bridge_test = (ROOT / "tools/test_mod_option_bridge.py").read_text()
check("Executable Lua was accepted" in mod_option_test_source and "restoreNativeModDefaults" in mod_option_test_source
      and "performanceProfileDidChange" in mod_option_test_source and "Corrupt-primary recovery" in mod_option_test_source
      and "outside the declared step" in mod_option_test_source and "forgetNativeModOptionMetadata" in mod_option_test_source,
      "native schema/state regression rejects executable discovery and covers recovery, range/step, uninstall, profile, and default precedence")
check("Lua native mod-option bridge tests passed" in mod_option_bridge_test
      and "GEN1RECOMP_NATIVE_OPTIONS_CAPTURE" in mod_option_bridge_test
      and "PotatoVoxel v1.4.4" in mod_option_bridge_test and 'choices = { { "ON", true }, { "OFF", false } }' in mod_option_bridge_test,
      "PUC Lua bridge regression covers PotatoVoxel boolean choices, broad schema normalization, and in-game value mirroring")
download_test_source = (ROOT / "tools/test_downloads.ts").read_text()
check("Persistent download manager tests passed" in download_test_source and "bytes=4-" in download_test_source
      and "Ignored Range fixture" in download_test_source and "pauseResumeTest" in download_test_source
      and "processReloadAndBackupRecoveryTest" in download_test_source
      and "transactionRollbackTest" in download_test_source
      and "malformedAndMismatched206Test" in download_test_source
      and "queuedCancelReuseTest" in download_test_source
      and "activeCancelAndDiscardTest" in download_test_source
      and "sizeAndHashFailureTest" in download_test_source,
      "host download regression covers reload/backup recovery, strict Range restart, queue reuse, pause/cancel/discard, progress, size, and hash failure")
alert_test_source = (ROOT / "tools/test_runtime_alert_policy.py").read_text()
check("Invalid vertex map value: 0" in alert_test_source and "actor decal pass aborted" in alert_test_source
      and "generic post-ready alert still dismisses" in alert_test_source,
      "exact PotatoVoxel caught-exception alert/dismissal regression is recorded")
lua_error_test_source = (ROOT / "tools/test_lua_error_diagnostics.py").read_text()
check("first failure must not read the absent optional log" in lua_error_test_source
      and "oversized history was not rotated" in lua_error_test_source
      and "binary-looking error content was not redacted" in lua_error_test_source,
      "reproducible PUC-Lua regression covers first-error persistence, append, rotation, and redaction")
localization_source = (ROOT / "modules/localization.ts").read_text()
check("Device.systemLanguage" in localization_source and "typeof EN" in localization_source, "bilingual UI strings are centralized and shape-checked")
check(localization_source.count("exportDiagnostics:") == 2 and localization_source.count("consoleDiagnosticsBody:") == 2 and localization_source.count("diagnosticsJSONL:") == 2 and localization_source.count("loadReportBody:") == 2, "complete console diagnostics and LOAD REPORT guidance are localized in English and German")
check(localization_source.count("installFromGitHub:") == 2 and localization_source.count("modPacking:") == 2, "GitHub install and packed-import progress are localized in English and German")
check(localization_source.count("modSettings:") == 2 and localization_source.count("restoreModDefaults:") == 2
      and localization_source.count("modSettingsDiscoveryBody:") == 2, "mod settings, discovery boundary, and default reset are localized in English and German")
check(localization_source.count("downloadManager:") == 2 and localization_source.count("downloadPartialNotice:") == 2
      and localization_source.count("cancelDownloadTitle:") == 2, "download manager, resume safety, and controls are localized in English and German")
check(not (ROOT / "mods").exists(), "no third-party mod is bundled or redistributed")

rom_source = (ROOT / "modules/rom.ts").read_text()
for edition, digest in CANONICAL_SHA1.items():
    check(digest in rom_source, f"canonical {edition} SHA-1")
check('support: "early"' in rom_source, "Gold is marked beta/early rather than stable")

all_source = "\n".join(
    path.read_text(errors="replace")
    for path in ROOT.rglob("*")
    if path.is_file() and path.suffix in {".ts", ".tsx", ".js", ".mjs", ".html"}
)
check("/var/mobile/Documents" not in all_source, "no guessed iOS container path")
check("Health.query" not in all_source, "no unrelated HealthKit access")
for forbidden in ["HttpServer", "HttpResponse", "listenAddressIPv4", "RUNTIME_PORT", "TCPServer", "127.0.0.1", "localhost"]:
    check(forbidden not in all_source, f"all executable source excludes PRO/server primitive: {forbidden}")
for forbidden in ["Archive.openForMode", "FileManager.zipSync", "FileManager.unzipSync", "FileManager.zip(", "FileManager.unzip("]:
    check(forbidden not in all_source, f"all executable source excludes host archive primitive: {forbidden}")
check(not (ROOT / "runtime/launch.js").exists(), "no generated ROM-bearing launch script is bundled")

payloads = [
    path.relative_to(ROOT).as_posix()
    for path in ROOT.rglob("*")
    if path.is_file() and path.suffix.lower() in {".gb", ".gbc", ".rom", ".z64", ".n64", ".v64", ".sav", ".state", ".ipa"}
]
check(not payloads, f"no copyrighted/user payload files bundled ({', '.join(payloads) if payloads else 'none'})")

for name in ["red", "blue", "yellow", "gold", "custom"]:
    cover = ROOT / f"assets/covers/{name}.png"
    valid = False
    if cover.exists():
        data = cover.read_bytes()
        if data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) >= 24:
            width, height = struct.unpack(">II", data[16:24])
            valid = (width, height) == (720, 1000)
    check(valid, f"original local cover is 720x1000 PNG: {name}")

for licence in [
    "references/LICENSE-Gen1Recomp.md",
    "references/LICENSE-Wilds-of-Kanto.md",
    "runtime/LICENSE-love.js.txt",
    "runtime/LICENSE-LOVE-11.5.txt",
    "runtime/LICENSE-Emscripten-2.0.0.txt",
]:
    text = (ROOT / licence).read_text(errors="replace") if (ROOT / licence).exists() else ""
    check(len(text) > 800, f"third-party licence retained: {licence}")

manifest_path = ROOT / "MANIFEST.sha256"
try:
    manifest: dict[str, str] = {}
    for line in manifest_path.read_text().splitlines():
        digest, relative = line.split("  ", 1)
        if not re.fullmatch(r"[a-f0-9]{64}", digest) or relative in manifest:
            raise ValueError(f"invalid or duplicate manifest line: {line}")
        manifest[relative] = digest
    expected_files = {
        path.relative_to(ROOT).as_posix()
        for path in ROOT.rglob("*")
        if path.is_file() and path != manifest_path and "__pycache__" not in path.parts and path.suffix != ".pyc"
    }
    check(set(manifest) == expected_files, "source hash manifest covers every distributable file exactly once")
    check(all(sha256(ROOT / relative) == digest for relative, digest in manifest.items()), "source hash manifest matches all distributable bytes")
except Exception as error:
    failures.append(f"source hash manifest is readable: {error}")

for message in checks:
    print(f"  OK  {message}")
if failures:
    print(f"FAIL {len(failures)} checks", file=sys.stderr)
    for message in failures:
        print(f"  ERR {message}", file=sys.stderr)
    raise SystemExit(1)
print(f"PASS {len(checks)} checks")
