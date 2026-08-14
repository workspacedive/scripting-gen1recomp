# Sources and provenance

Research and implementation were cross-checked on 2026-08-13.

## Gen1Recomp

- Repository: <https://github.com/bryanthaboi/gen1recomp>
- Release API inspected: <https://api.github.com/repos/bryanthaboi/gen1recomp/releases/tags/v0.1.78>
- Official asset: <https://github.com/bryanthaboi/gen1recomp/releases/download/v0.1.78/gen1recomp-0.1.78.love>
- Version: `v0.1.78`
- Official asset size: `4,418,896` bytes
- Official asset SHA-256: `4dfd6e78808024eda0cce8b9fa5434a5846d1aa327912f7a1ce3c888e416c4fe`
- License: MIT (`references/LICENSE-Gen1Recomp.md`)

The README and source were used to verify that Gen1Recomp is a hand-written Lua/LÖVE recreation that decodes data and graphics from a player-supplied ROM, not a Game Boy emulator. The source’s `GameVersion`, `RomImporter`, `RomExtractor`, `CacheFs`, `SaveData`, `TouchControls`, `Music`, and `conf.lua` behavior informed the integration.

Mod architecture was cross-checked against:

- official Getting Started wiki: <https://github.com/bryanthaboi/gen1recomp/wiki/Getting-Started>;
- v0.1.78 `src/mods/Loader.lua`, `Manifest.lua`, `ManagerState.lua`, `LauncherMods.lua`, and `ModUpdate.lua`;
- official mod index format: <https://github.com/bryanthaboi/gen1recomp-mod-index>.

These confirm that persistent mods live at `pokemon-love2d/mods/<id>`, `manifest.json` plus an entry file is the native package shape, missing enable flags mean enabled, and changes apply at the next boot. The current main-branch `Manifest.lua` was also reviewed for API-2 engine ranges, permissions, dependency/conflict fields, and normalized GitHub update metadata used by the suite’s data-driven checks.

### Mod-option persistence and auto-UI research

The current Getting Started wiki was re-fetched for 3.2.8. Its mod-manager section confirms that mods default enabled, `options.lua` is the persistent state, the genuine START/Options mod UI edits a mod’s registered schema, and content-affecting changes take effect after restart. Exact v0.1.78 `src/mods/Loader.lua` and `src/core/SaveData.lua` established the authoritative implementation: schemas are registered through `mod.options:define`, primitive values live at `options.modOptions[modId][key]`, manifest `options_schema` is loaded lazily in the mod sandbox, and option writes use `SaveData.saveOptions`.

The four supported row contracts—`toggle`, `choice`, `number`, and `text`—and Gen1Recomp’s missing-default behavior were checked directly against the release source rather than inferred from third-party examples. When absent, defaults normalize to `false`, `0`, the first choice, `""`, and a text maximum length of `7`. That exact behavior is shared by the native parser/state layer and both deterministic/dynamic engine patchers.

For 3.3.0, official Gen1Recomp `v0.1.80` was additionally downloaded from <https://github.com/bryanthaboi/gen1recomp/releases/download/v0.1.80/gen1recomp-0.1.80.love>, verified against GitHub’s published SHA-256 `3e69eb7de7679bd463aa4897743b9b1715a7bc90f7c8966ece239479dd59bd23`, and inspected together with `docs/mod-option-schema.md`. The version-1 runtime snapshot contract defines choices as `[label, value]` tuples. Its source and a headless LuaJIT engine harness were used to test the suite’s dynamic patch against a newer genuine engine, not merely the bundled 0.1.78 base.

Exact PotatoVoxel `v1.4.4` was downloaded from <https://github.com/ShaneMcGovernIE/potato_voxel/releases/tag/v1.4.4> and verified against its published SHA-256 `f9bedd5c1ed1074427fb5a6e3d5acac501f0cc0fba7be3c5516d12abecbb2c64`. Its `main.lua` builds twelve Web-compatible rows at runtime and calls `mod.options:define(schema)`. The `SHADOWS` row is intentionally a `choice` with `{ "ON", true }` and `{ "OFF", false }`. A Lua expression in the old native normalizer collapsed that legitimate `false` value to `nil`, causing the all-or-nothing schema rejection seen in the target-device snapshot. The revised normalizer preserves false tuple/object values and skips only malformed sibling rows; an exact v0.1.80 + PotatoVoxel 1.4.4 headless run captured all 12 rows.

The same exact v1.4.4 archive is the revision-9 performance/stability fixture. LÖVE 11.5 Mesh documentation at <https://love2d.org/wiki/Mesh:setVertexMap> and the 11.5 API/source references distinguish one-based Lua table vertex maps from zero-based raw indices in Data-form maps. Revision 9 therefore changes only the unique table-map block in `lib/SpriteBillboards.lua`, not general maps or `Voxel3D.pushQuad`. Exact publisher blocks in `lib/OverworldBattle.lua` and `lib/VoxelScene.lua` receive one-failure retirement/quarantine plus first-failure tracebacks. `tools/test_potato_voxel_compat.py` binds all three paths to the official archive digest, proves an alternate mod path stays byte-identical, and compiles transformed output under official PUC Lua 5.1.5. The source test does not substitute for the iPhone frame-time checklist.

Exact public releases were then audited as compatibility fixtures:

- **Wilds of Kanto 1.12.2:** manifest `options_schema: "options.lua"`; its data-only literal table contains 18 rows. This exercises import-time parsing without executing Lua.
- **Kanto Life 0.6.1:** `main.lua` calls `mod.options:define` with 10 rows. No manifest schema is declared, so native discovery must wait for genuine runtime initialization.
- **Kanto Ascendant 6.0.11:** `main.lua` builds a 45-row runtime schema. It exercises the larger dynamic-schema and performance-preset path.
- **Dramatic Shape 1.8.2:** `main.lua` generates 14 setting rows through `lib/ModSetting.lua` and supplies them to `mod.options:define`. It exercises generated dynamic rows rather than a hardcoded manifest table.

These observed counts are regression assertions only. The shipped dashboard does not contain a per-mod schema catalog: literal schemas are re-parsed within strict bounds on install/update, while dynamic schemas are normalized only from genuine Gen1Recomp after sandboxed load and are version-tagged in native state. This preserves compatibility with future releases and avoids executing arbitrary installed Lua in the native shell.

## 3.4 runtime, Lua, WebAssembly, and overlay research

The production decision was rechecked against current upstream material on 2026-08-13:

- Lua versions: <https://www.lua.org/versions.html>, Lua 5.5 readme <https://www.lua.org/manual/5.5/readme.html#changes>, and manual GC section <https://www.lua.org/manual/5.5/manual.html#2.5>. Lua 5.5 was released 2025-12-22 and current 5.5.1 adds compact arrays, incrementally performed major collections, `table.create`, external strings, and fixed binary chunks. These are promising for a rebuilt runtime, but not source/ABI/bytecode-compatible drop-ins for the embedded PUC Lua 5.1/LÖVE stack.
- Lua 5.1 GC: <https://www.lua.org/manual/5.1/manual.html#2.10>. It is incremental mark-and-sweep with pause/step controls. No speculative default was shipped because tuning is workload/device dependent; 3.4 first adds measured heap/graphics fields and an emergency low-memory collection.
- LuaJIT iOS/platform limits: <https://luajit.org/install.html>, <https://github.com/LuaJIT/LuaJIT/issues/38>, and LÖVE Apple-Silicon discussion <https://love2d.org/forums/viewtopic.php?t=95265>. Browser love.js is PUC Lua, LuaJIT’s iOS JIT cannot be assumed, and its collector remains Lua-5.1-derived.
- LÖVE 12 status: <https://love2d.org/wiki/12.0>, <https://github.com/love2d/love/milestone/1>, and experimental SDL3 Web builder <https://github.com/rozenmad/love-web-builder>. LÖVE 12 remains unreleased and its SDL3/Emscripten browser path is experimental, so 3.4 retains verified LÖVE 11.5.
- love.js status/build constraints: <https://github.com/Davidobot/love.js/> and <https://github.com/2dengine/love.js/>. Stable browser behavior remains LÖVE 11.5 without LuaJIT. Davidobot’s documented source build pins Emscripten 2.0.0 around the later-removed `getMemory` behavior; a current-toolchain rebuild requires source porting, not a compiler flag swap.
- Emscripten/WebAssembly: <https://github.com/emscripten-core/emscripten/releases>, <https://emscripten.org/docs/optimizing/Optimizing-Code.html>, and <https://emscripten.org/docs/tools_reference/settings_reference.html>. Current optimization/memory/thread/SIMD options were reviewed but no pthread, OffscreenCanvas, WebGPU, or exception-mode migration was enabled without a compatible runtime/device matrix.
- Safari/WebKit: <https://webkit.org/blog/17333/webkit-features-in-safari-26-0/>, <https://webkit.org/blog/17640/webkit-features-for-safari-26-2/>, and Emscripten issue <https://github.com/emscripten-core/emscripten/issues/25365>. Emerging WebGPU/resizable-memory support does not make WebGPU a LÖVE 11.5 switch, and Wasm exception behavior remains conservative.
- LÖVE telemetry/pressure APIs: <https://love2d.org/wiki/love.graphics.getStats> and <https://love2d.org/wiki/love.lowmemory>. 3.4 reuses one output table for bounded graphics counters and performs collection only on the actual low-memory callback.
- Official LÖVE 11.5 boot source: <https://raw.githubusercontent.com/love2d/love/11.5/src/modules/love/boot.lua>. It proves that LÖVE mounts the selected source, temporarily appends the inferred identity so source `conf.lua` wins, loads configuration before optional modules, later applies `c.appendidentity`, and only then requires source `main.lua`. Those exact ordering points make the executable broker possible.
- LÖVE mount precedence: <https://love2d.org/wiki/love.filesystem.mount> and the 11.5 `Filesystem.cpp` implementation. `FileData`/`Data` archives can be mounted in memory, and `appendToPath=true` keeps the already selected source first. The layer sets `t.appendidentity=true` so writable save storage remains behind both executable sources.
- Chromium security principles: <https://www.chromium.org/Home/chromium-security/core-principles/>. The adaptation is defense in depth and safe defaults, not a claim that a Lua layer becomes Chromium's OS sandbox.
- Chromium Component Updater overview: <https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/component_updater/>. Its explicit benefit is updating pieces without updating Chrome, permitting faster/desynchronized cadence and smaller installers; its explicit drawback is that Chrome must tolerate component absence sanely. Components use signed CRX archives and may bundle a known implementation when availability is mandatory.
- Chromium component registration/on-demand interface: <https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/component_updater/component_updater_service.h>. Registration binds identity/public-key hash, version, fingerprint, installer policy, network/metered policy, and update permission. Only a bigger version is downloaded, verified, unpacked, and handed to a component-specific installer. Foreground/background on-demand updates exist with defensive cooldown. The suite adapts the applicable parts into independent layer identity/version, exact core registration, monotonic activation, explicit on-demand import, bounded archives, per-file and archive digests, component-specific validation, transactional replacement, post-install verification, and sane bundled/generated fallback.
- Chromium update protocol and installer transaction notes: <https://chromium.googlesource.com/chromium/src/+/main/docs/updater/protocol_3_1.md> and <https://chromium.googlesource.com/chromium/src/+/553a5fcb513fb4e7a25a8a746093e47d78d1bab7/chrome/updater/installer.h>. Chrome protects update responses with CUP, may use ranged downloads, commits persisted version only after installer success, and cleans incomplete filesystem residue later. This supports the suite's existing strict Range/`206` checks, bounded retries, state-last commit, staging/backups, launch recovery, and post-activation verification.
- Scripting Crypto: <https://scriptingapp.github.io/guide/Utilities/Crypto>. The free API documents hashes, HMAC, and AES-GCM but no asymmetric publisher-signature verification. Therefore a user-selected executable layer is labeled an explicit local trust action. It is never presented as equivalent to Chrome's CRX publisher proof, and automatic remote layer installation is omitted until a real signature/feed boundary exists.
- Chromium Site Isolation design: <https://www.chromium.org/developers/design-documents/site-isolation/>. Its privileged-broker/lower-trust-execution model informed the native verifier → layer broker → mounted-core boundary. This project cannot create browser processes from Lua, so the applicable principle is enforcement at the host/broker boundary rather than process-isolation marketing.
- Chrome Root Store component example: <https://chromium.googlesource.com/chromium/src/+/main/net/data/ssl/chrome_root_store/faq.md>. It demonstrates policy/data replacement without replacing the browser binary; here, compatibility/policy/diagnostic modules can change without editing or rebuilding the Gen1Recomp core.
- Alternative Lua-to-WebAssembly projects, including <https://github.com/rhmoller/lua2wasm/>, were reviewed. Missing dynamic loading/coroutine/LÖVE/mod compatibility prevents an AOT/WasmGC replacement for arbitrary current mods.

The resulting production choices are intentionally conservative: no LuaJIT-on-Wasm, Lua 5.4/5.5 VM swap, LÖVE 12, Fengari/Wasmoon, AOT source rewriting, WebGPU backend, Wasm exceptions, or pthread runtime. `config/compatibility-pack.json` schema 2 records exact layer/core compatibility, precedence, rollback, capabilities, and effective targets. Chromium 140 then proved actual source-layer boot plus immutable-core mount, corrupt/absent-core rejection, save-directory shadow resistance, and non-execution/removal of a malicious writable updater boot/pending/archive fixture. PUC Lua 5.1 separately exercised cleanup and pure-selector compatibility. WKWebView remains a named device qualification rather than an automated claim.

## External Dramatic Shape test source

- Repository supplied by the user: <https://github.com/scottcandy34/DramaticShapeVoxelMod-latest>
- Explicit latest-release API: <https://api.github.com/repos/scottcandy34/DramaticShapeVoxelMod-latest/releases/latest>
- Tested release: `v1.8.2`
- Tested asset: `DRAMATIC_SHAPE-1.8.2.zip`, 8,380,403 bytes compressed
- GitHub digest: `sha256:31a6a4e810610d540b830d411b6c47272407e9254b2969171aca780fcbe874f2`
- Manifest: mod API 2, `engine_internals`, Gen1Recomp `>=0.1.37 <2.0.0`

The repository states that it is a faithful copy and that redistribution of non-derivative code after v1.6.0 is prohibited without permission. Therefore neither its ZIP nor its files are included in the suite. The native shortcut performs a direct, explicit, digest-verified user download into private local mod storage.

## Large-mod compatibility sources

- Wilds of Kanto repository/release: <https://github.com/YoDrehDenSwagAuf/overworld-spawn-mod/releases/tag/v1.12.2>
- Release metadata API: <https://api.github.com/repos/YoDrehDenSwagAuf/overworld-spawn-mod/releases/tags/v1.12.2>
- Tested public asset: `Wilds.of.Kanto.v1.12.2.zip`, 13,745,457 bytes
- SHA-256: `7272a62c7d72f069295281835c0a6cdbaccd2bcf0c24b2b8284c90b9d68a8e3b`
- Measured shape: 11,955 ZIP entries, 11,921 regular files, 15,860,867 extracted bytes; largest file 1,097,854 bytes
- Parsed package identity: `overworld_wild_spawns@1.12.2`
- Source license: MIT; retained at `references/LICENSE-Wilds-of-Kanto.md` for the narrow compatibility anchor (no mod assets are redistributed)
- v3.2.2 result: one 12,927,909-byte normalized package; fresh Chromium mounted it and loaded all 151 registered sprite sources before `game loaded`.
- v3.2.6 source review: exact `lib/spawn_render.lua` is 91,263 bytes and its optional `bakeSheet` calls `canvas:newImageData()` followed by `idata:encode("png")`; the module is compiled by the mod’s own `loadstring(mod:read(...), "@" .. path)` loader.
- Real-device evidence: two Wilds-active 3.2.5 sessions logged `No suitable image encoder for rgba4 format` and attributed `map.entered`/`save.loaded` nil calls; the Wilds-inactive session succeeded with the package still mounted.
- Forced-format Chromium evidence: the 3.2.5 engine reproduced the alert; the rebuilt engine loaded exact Wilds 1.12.2 and completed the same forced-`rgba4` bake probe through Wilds’ existing fallback without an alert/error/network request.
- Real-device 3.2.6 evidence: the target iPhone printed the guard marker, prepared 1,298 runtime sheets, registered 151 sprites, loaded Route 2, and completed two Wilds battles without the old encoder error. A later alert came from the separate Lua-error diagnostics chain described below.

### Kanto Ascendant v6.0.11

- Repository/release: <https://github.com/Roxas2712/kanto-ascendant/releases/tag/v6.0.11>
- Exact release API: <https://api.github.com/repos/Roxas2712/kanto-ascendant/releases/tags/v6.0.11>
- Commit: `52188797de03890722cb18bfc15657a15f67cb60`
- Tested ZIP: `kanto-ascendant-6.0.11.zip`, 16,662,061 bytes
- GitHub SHA-256: `72779b0a9923e2e3908573552858718aa09bc6eae25222d1268bf3f1e41b62e7`
- Shape: 10,780 DEFLATE files, 17,743,467 extracted bytes, 10,601 PNG files
- Manifest: `trainer_rematch@6.0.11`, API 2, `main.lua`, `engine_internals`, `assets_transforms: shiny_transforms.lua`

The ZIP and `.modpkg` release assets are byte-identical. Source/release notes establish that the package uses a first-run asset-transform recipe. Inspection of genuine Gen1Recomp `src/mods/AssetTransform.lua` identified the optional `save/mod-derived/<id>/.stamp` read; exact runtime reproduction showed compatibility love.js logged the missing stamp but did not return. The fix follows the upstream module’s intended optional-stamp semantics by probing `getInfo` first, then schedules successful first-run work cooperatively on Web only. No Kanto Ascendant file is redistributed.

### Kanto Life 0.6.1

- Repository/release supplied by the user: <https://github.com/jtfresh90/Kanto-Life-Mod/releases/tag/0.6.1>
- Exact release API: <https://api.github.com/repos/jtfresh90/Kanto-Life-Mod/releases/tags/0.6.1>
- Tested asset: `kanto-life-0_6_1.zip`, 12,952 bytes
- GitHub SHA-256: `4b4eacec9fdb05822c8f1164cd1b19743d15f51c48e6df328adcc99e2d086031`
- Manifest: `kanto_life@0.6.1`, API 2, `main.lua`
- Exact source evidence: line 303 begins the first of three LuaJIT-style terminal-label continue loops.
- v3.2.4 normalized package: 12,796 bytes, SHA-256 `b7950313874e569b8d0234f81f0e297461a0c42e3ebee7574f6abee9ee91380d`.
- Lua 5.1 grammar reference: <https://www.lua.org/manual/5.1/manual.html>
- Official PUC Lua 5.1.5 source used for independent `lua`/`luac` validation: <https://www.lua.org/ftp/lua-5.1.5.tar.gz>
- LuaJIT extension reference: <https://luajit.org/extensions.html>
- love.js/PUC-Lua compatibility discussion: <https://love2d.org/forums/viewtopic.php?t=96372>

The release archive remains external. The suite neither redistributes nor persists a modified copy of its source; the constrained compatibility pass operates on the in-memory source immediately before Web compilation.

The official v0.1.78/current Gen1Recomp `src/mods/Manifest.lua` was reviewed to confirm dependency/conflict declaration behavior (`id` and `id@<range>` forms) and the runtime’s save/mod-set reconciliation behind `LOAD REPORT`. The suite does not suppress that report; it adds native explanation and preflight metadata health only.

The reported Stadium 2 Overworld Models v0.1.86 package was searched through the public Gen1Recomp mod index, GitHub repository search, and related Stadium importer/releases. The available `Deftones565/gen1recomp-mod-stadium2-importer` release is a different project/version and was not treated as equivalent. Because the exact archive could not be obtained, no package-specific compatibility result is claimed.

## LÖVE browser runtime

- Repository: <https://github.com/Davidobot/love.js>
- Commit: `c4f04e185033a7c9fbefa9be3bec88c41a90421b`
- Commit date: 2024-05-13
- Variant: `src/compat` (no pthreads / no SharedArrayBuffer requirement)
- Runtime hashes:
  - `love.js`: `6917d551d1dafea3b2a5315480792bdd57772029f094d9e992b259ef7fcb3b14`
  - `love.wasm`: `8e955d3ca1db20c2c3509313c0093cf81826fc391f509194f85562ac57c601fa`
- Wrapper license: MIT (`runtime/LICENSE-love.js.txt`)
- LÖVE/dependency notices: `runtime/LICENSE-LOVE-11.5.txt`
- Emscripten notices: `runtime/LICENSE-Emscripten-2.0.0.txt`

### Generic-alert and first-error diagnostics source

The 3.2.6 iPhone trace was cross-checked against exact historical source rather than the alert wording:

- Gen1Recomp v0.1.78 commit source: <https://raw.githubusercontent.com/bryanthaboi/gen1recomp/2fabc03841c1b7b43a873a4543f8aec26ddd82a4/src/debug/SwitchDiagnostics.lua> — `logLuaError` unconditionally performs `filesystem.read(ERROR_LOG)` before its first write, although `lua-error.log` is optional and absent until an error has already been logged.
- Davidobot LÖVE Emscripten branch: <https://github.com/Davidobot/love/tree/emscripten> — contains a non-upstream customization in `src/common/Exception.cpp` under `LOVE_EMSCRIPTEN`.
- Exact introducing commit: <https://github.com/Davidobot/love/commit/f64636ac516eed78aeccef94575e7a285faaa296> — on 2020-09-17 added console printing and `emscripten_run_script("alert('An error occurred before the game window could be initialised…')")` to every `love::Exception` constructor.
- Exact source at that commit: <https://raw.githubusercontent.com/Davidobot/love/f64636ac516eed78aeccef94575e7a285faaa296/src/common/Exception.cpp>.
- Follow-up console-newline commit: <https://github.com/Davidobot/love/commit/e9163e085b7492890916e5410f49cd46c8fb6394>.
- Generated love.js rebuild: <https://github.com/Davidobot/love.js/commit/2c6c6049c468347c94d47ee74cf053313da24525> — links the Emscripten script-evaluation bridge corresponding to that source change.
- Stock LÖVE 11.5 boot source: <https://raw.githubusercontent.com/love2d/love/11.5/src/modules/love/boot.lua> — confirms normal LÖVE dispatches an unhandled Lua error to `love.errorhandler`; the generic browser alert is not the stock handler’s message.

Together these sources explain the exact trace order: an unseen originating Lua error entered Gen1Recomp’s handler; its missing optional error-log read constructed a secondary `love::Exception`; Davidobot’s constructor printed `Could not open file lua-error.log. Does not exist.` and alerted even though the message falsely describes a pre-window condition. Version 3.2.7 probes before reading and prints the originating traceback before all persistence work; 3.2.8 retains that contract unchanged alongside the option bridge. Neither suppresses arbitrary LÖVE exceptions or infers the still-unknown gameplay error.

The upstream README explicitly recommends the compatibility build for browsers without cross-origin-isolation headers and warns that compatibility audio can be imperfect. It also recommends probing `love.filesystem.getInfo` before reading a potentially missing path—the behavior required by the CacheFs and first-transform-stamp guards.

LÖVE 11.5 filesystem behavior was cross-checked against <https://love2d.org/wiki/love.filesystem>, <https://love2d.org/wiki/love.filesystem.getInfo>, and <https://love2d.org/wiki/love.filesystem.mount>. The official mount documentation explicitly supports mounting a ZIP from the game save directory at a chosen virtual path and reports a boolean result. This is the basis for mounting a validated `native-mod-packages/<id>.zip` at the genuine loader’s ordinary `mods/<id>` path.

The Wilds encoder diagnosis was additionally checked against official LÖVE 11.5 source and API documentation:

- `ImageData.cpp`: <https://raw.githubusercontent.com/love2d/love/11.5/src/modules/image/ImageData.cpp> — raises `No suitable image encoder for <format>` when no registered handler accepts the raw pixel format;
- `PNGHandler.cpp`: <https://raw.githubusercontent.com/love2d/love/11.5/src/modules/image/magpie/PNGHandler.cpp> — `canEncode` accepts PNG only for `PIXELFORMAT_RGBA8` and `PIXELFORMAT_RGBA16`;
- `ImageData:getFormat`: <https://love2d.org/wiki/ImageData:getFormat>;
- pixel-format table: <https://love2d.org/wiki/PixelFormat> — `rgba4` is valid for ImageData from LÖVE 11.3 onward, but validity does not imply PNG-encoder support.

These establish a capability mismatch rather than corrupt graphics or a missing WebAssembly module. The 3.2.6 guard tests the exact raw format before the optional third-party cache bake and changes no LÖVE binding or publisher archive.

Runtime-update research also inspected:

- npm `love.js` (latest published package remains 11.4.1, older than the bundled LÖVE 11.5 lineage);
- <https://github.com/2dengine/love.js> and <https://2dengine.com/doc/lovejs.html> (maintained LÖVE 11.5 frontend, but no proven drop-in coupled binary for this patched serverless host);
- <https://github.com/rozenmad/love-web-builder> (experimental newer LÖVE/SDL3 path; binaries are not packaged because drop-in compatibility and redistribution rights are not established);
- <https://github.com/love2d/love/releases> (LÖVE 11.5 remains the relevant stable runtime ABI here).

Therefore the suite does not silently replace JavaScript or WASM from a moving source. It checks the pinned Davidobot branch commit only for source awareness and accepts a replacement pair solely through a user-supplied, hash-declared, no-pthreads compatibility bundle.

## Resumable download research

The 3.3.0 manager was cross-checked against:

- RFC 9110 range-request semantics: <https://www.rfc-editor.org/rfc/rfc9110.html#name-range-requests>;
- MDN `Range`: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Range>;
- MDN `Content-Range`: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Range>;
- Scripting’s current `fetch`, `Response`, `Headers`, `Data`, and `FileManager` documentation listed below.

A partial is appended only after a `206 Partial Content` response whose `Content-Range` starts at the exact persisted file size and declares the trusted release total. `If-Range` binds retries to a saved ETag or Last-Modified validator where available. A server response of `200 OK` to a resumed request is treated as a full replacement: the partial is discarded before the response body is written. `416`, mismatched totals, excess bytes, expected-size mismatch, and SHA-256 mismatch cannot promote a partial into a component, mod, or IPA. GitHub’s live PotatoVoxel 1.4.4 release endpoint was probed with `Range: bytes=1000-1999`; the redirected asset returned `206`, `Accept-Ranges: bytes`, and `Content-Range: bytes 1000-1999/705060` with exactly 1,000 bytes.

Scripting is not an iOS background `URLSession` daemon. The honest guarantee is persisted partial-file recovery on the next suite attempt, not continuation after iOS terminates the script.

## Scripting documentation

Official local documentation consulted:

- `references/scripting-app/development-skill/references/project-and-lifecycle.md`
- `references/scripting-app/development-skill/references/ios-pages.md` — object-form presentation, finite lifecycle, and modal presentation behavior.
- `references/scripting-app/official-docs-app-store/view_modifiers/status_bar/en.md` — full-screen `Navigation.present` presentation behavior.
- `references/scripting-app/development-skill/references/validation-and-security.md`
- `references/scripting-app/official-docs-app-store/webview_controller/en.md` — documents `loadFile(path, allowingReadAccessTo)`, Promise-capable `addScriptMessageHandler` callbacks, `dismiss`, and mandatory `dispose` used by the free-tier local player and explicit runtime-close bridge.
- Current official online `WebViewController` page: <https://scriptingapp.github.io/guide/Device%20Capabilities/WebViewController.md> — rechecked the same handler/dismiss/dispose contract for 3.2.5–3.2.9.
- `references/scripting-app/official-docs-app-store/data/en.md`
- Current official online `Data` page: <https://scriptingapp.github.io/guide/Utilities/Data> — confirms native binary `Data`, slicing/conversion, and combination behavior.
- `references/scripting-app/official-docs-app-store/file_manager/en.md` and current extracted `file_manager/en.md` — document async/sync reads, writes, copy, stat, rename, removal, append, Documents, and temporary-directory behavior. The docs explicitly state asynchronous I/O is internally backgrounded and synchronous methods block.
- Current official `Thread` page: <https://scriptingapp.github.io/guide/Utilities/Thread> and extracted `thread/en.md` — `Thread.runInBackground<T>` accepts CPU-heavy synchronous/Promise work and returns its result to the initiating thread; UI must not be manipulated in the worker. It is a global namespace and is not PRO-marked.
- Current official online `FileManager` page: <https://scriptingapp.github.io/guide/Utilities/FileManager.md> — rechecked `appendDataSync` for bounded streamed download chunks and the asynchronous `appendText` form recommended for nonblocking diagnostic persistence. Both create missing files/parents; revision 9 serializes async diagnostic batches and retains one intact synchronous fallback for host failure.
- Current official online `fetch` page: <https://scriptingapp.github.io/guide/Utilities/Request/fetch.md> — documents timeout, `AbortSignal`, redirects, headers, and debug labels.
- Current official online `Response` page: <https://scriptingapp.github.io/guide/Utilities/Request/Response.md> — documents `dataStream` as the zero-copy `ReadableStream<Data>` path and `expectedContentLength`.
- Current official online `Headers` page: <https://scriptingapp.github.io/guide/Utilities/Request/Headers.md> — documents case-insensitive response-header reads used for ETag, Last-Modified, Content-Length, Content-Range, and Retry-After.
- `references/scripting-app/official-docs-app-store/views/controls/progress_view/en.md` — confirms determinate `value`/`total` and linear progress styling used by the manager.
- `references/scripting-app/official-docs-app-store/document_interaction/en.md` and its official example — documents `optionsMenu(filePath)` and temporary export handoff.
- Current official online `DocumentInteraction` page: <https://scriptingapp.github.io/guide/Device%20Capabilities/DocumentInteraction/index.md>.
- `references/scripting-app/official-docs-app-store/archive/en.md` — consulted, but the user’s installed free build reports that this documented API requires PRO. It is therefore explicitly not used; ZIP/DEFLATE is implemented locally in `modules/zip.ts`.
- `references/scripting-app/official-docs-app-store/document_picker/en.md`
- `references/scripting-app/official-docs-app-store/views/dialog/en.md` — confirmation and text prompt used by the strict GitHub release-URL flow.
- extracted official `Data` documentation confirms `slice(start,end)` for bounded native chunk generation; 3.4 no longer uses `Data.combine(parts)` for the launch package.
- Machine-readable current official `doc.json` was recursively audited for every `"pro": true` node. `Thread`, core/async `FileManager`, `Data`, `Crypto`, `WebViewController`, Keychain, and local Notification are not PRO-marked. `Archive`, `HttpServer`, `BackgroundKeeper`, SQLite, Core Haptics, CloudSharedData, and Remote Push are explicitly PRO-marked and remain excluded.
- `references/scripting-app/official-docs-app-store/crypto/en.md`
- `references/scripting-app/official-docs-app-store/views/navigation/tab_view/with_badge.tsx` — baseline `TabView`, integer `tabIndex`, child `tag`, badges, and `Label` tab items.
- `references/scripting-app/official-docs-app-store/views/tabview/en.md` — newer OS-specific tab customization was reviewed but is not required.
- `references/scripting-app/official-docs-app-store/views/controls/picker/en.md` — string tags, `value`/`onChanged`, and segmented style.
- `references/scripting-app/official-docs-app-store/views/controls/toggle/en.md` — boolean `value`/`onChanged` for Settings opt-in.

Documented symbols used include `Navigation.present`, `Navigation.useDismiss`, `Script.exit`, `TabView`, `Label`, `Picker`, `Toggle`, `ProgressView`, `useEffect`, `DocumentPicker`, `Data.slice`, `FileManager` async/sync methods, `Thread.runInBackground`, `Crypto`, `WebViewController`, `fetch`, `Response.dataStream`, `AbortController`, `DocumentInteraction`, and `Safari`. Server and host archive APIs remain deliberately absent through 3.5.0 because they require Scripting PRO; the worker, ordered asynchronous diagnostics, and self-contained ZIP implementation use only free-tier primitives.

No connected Scripting installation was available to supply version-synchronized `.d.ts` declarations. `tools/host-shim.d.ts` is therefore a validation-only subset, not device evidence.

## Cover assets

The five local cover images are suite-authored, stylized generic library art at 720×1000 PNG. They are not scans of retail box art and contain no ROM-derived imagery.

## Community references

ScriptingFun community archives were catalogued and statically audited during research for project-structure patterns only. Their code was not executed or copied because individual licensing was not established. The target implementation relies on official Scripting documentation and declarations/interfaces documented there.