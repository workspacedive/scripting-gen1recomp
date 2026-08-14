# Validation record

Date: 2026-08-13  
Target: Gen1Recomp Native Suite 3.5.0

## Evidence levels

The checks below deliberately separate static validity, direct-file desktop-browser runtime evidence, and unperformed Scripting/iOS host evidence.

Version 3.0.0 failed on the user’s free Scripting installation because its player used PRO-only `HttpServer`. Version 3.0.1 replaced that transport. Version 3.1.0 then used the documented `Archive` API for mod ZIPs, but the user’s installed free build reported that archive APIs also require PRO. Version 3.1.1 removed all host server and archive APIs. Version 3.2.0 retained that architecture and added the four-tab/settings/performance/update suite; the user confirmed the finalized v3.2.0 archive runs perfectly. Version 3.2.1 is a focused source patch for full-screen/close behavior, legitimate large-mod bounds and manifest discovery, mod health/`LOAD REPORT` guidance, and privacy-safe diagnostics. Version 3.2.2 adds packed/lazy mod storage, cooperative import verification, strict direct GitHub release URLs, a missing transform-stamp guard, and post-boot background art transforms after the exact Kanto Ascendant v6.0.11 package reproduced an indefinite first-load stall. The user then reported on-device that new local/GitHub installations completed quickly but did not appear in the in-game manager. Version 3.2.3 closes the matching upgrade-state gap by rejecting an installed engine state created before the packed-mount patch contract and falling back to the bundled compatible engine. The user confirmed packed mods then appeared in-game, but exact Kanto Life 0.6.1 failed at `main.lua:303` because love.js embeds PUC Lua 5.1 rather than desktop LuaJIT. Version 3.2.4 adds and browser-verifies a strict terminal-continue compatibility pass. The user then confirmed gameplay but reported a generic love.js initialization alert, a player exit path that did not reliably return to the dashboard, and no accessible console. Version 3.2.5 adds persistent complete native/Web diagnostics, four Settings export formats, a non-blocking fatal panel, and explicit runtime exit/abort/alert dismissal. The user’s resulting real-device TXT export proves capture/export and the observed after-alert dismissal/save/cleanup path, and identifies the alert as exact Wilds 1.12.2 ImageData PNG encoding: iOS WebGL produced `rgba4`, while LÖVE 11.5’s PNG handler accepts `rgba8`/`rgba16`. Version 3.2.6 adds one exact in-memory format guard at Wilds’ self-loaded module boundary and raises the persisted engine patch contract to revision 3. Its forced-`rgba4` PUC-Lua/Chromium regressions passed, and the user’s next iPhone export now confirms the guard, Route 2 load, Wilds spawning, and two completed battles without the prior encoder error. That session later exposed a distinct first-failure diagnostics defect: Gen1Recomp attempted to read absent optional `lua-error.log`, and Davidobot’s Emscripten `love::Exception` customization generated the misleading generic alert before the originating Lua error could be persisted. Version 3.2.7 guards that read, prints a traceback first, mirrors both error-log generations, and raises the engine patch contract to revision 4. Version 3.2.8 retains those diagnostics, adds bounded native editing/reset for Gen1Recomp’s own mod-option schemas, bidirectional runtime write-back, literal data-only discovery, dynamic sandboxed discovery, and revision-5 component gating. The original Route 2 exception remains unqualified. The user then confirmed on the target device that 3.2.8 imports, runs, and opens a working native Mod settings editor, while reporting that its conditional navigation-toolbar Back item was not visible. Version 3.2.9 keeps the engine and option bridge unchanged, uses one stable toolbar button, and adds explicit in-content Back and Close escape actions that do not depend on toolbar refresh. The next genuine 3.2.9 target-device export proves Gen1Recomp 0.1.80 and PotatoVoxel 1.4.4 reach gameplay, then proves PotatoVoxel catches `Invalid vertex map value: 0` and continues while the suite misclassifies Davidobot’s generic alert and dismisses the running player. The same export reports zero PotatoVoxel native settings. Version 3.3.0 corrects both paths, adds the persistent verified download manager, and raises the engine patch contract to revision 6; the user subsequently confirmed that exact release works on the real device. Version 3.4.0 retains it as immutable rollback and adds free-tier background ZIP/layer/hash stages, async large-file I/O, bounded local chunk transport, persistent interrupted-launch recovery, a genuine revision-8 Chrome-inspired executable layer around a separately mounted immutable core, and measured Lua/Wasm/browser telemetry. The supplied 3.4.0 iPhone 16 Pro Max / iOS 26.6 TXT export is now direct device evidence for those logging/performance paths and exposes continuous PotatoVoxel retries plus rising frame time/memory. Version 3.5.0 raises the layer to revision 9, adds exact-source PotatoVoxel retirement guards, enabled-only mod payloads, ordered diagnostic batching, unchanged-save suppression, and transactional revision-8 migration. These new 3.5 effects are automated/source evidence until the updated device checklist is returned.

## 3.5.0 implementation evidence

### Supplied target-device performance diagnosis

The supplied `Gen1Recomp-Console-2026-08-13T18-28-45-370Z.txt` is 479,871 bytes / 6,809 lines / 2,262 events from suite 3.4.0 on iPhone 16 Pro Max / iOS 26.6. Its context reports installed Gen1Recomp 0.1.81, layer 2.0.0, LÖVE 11.5, and PotatoVoxel 1.4.4. The trace contains 549 actor-decal aborts and 262 identical `Invalid vertex map value: 0` failures; measured FPS declines from 45.18 to 3.79, Wasm heap grows from 256 MiB to 856 MiB, and Lua telemetry reaches 555,156.7 KiB. Texture memory remains stable, so a texture-only explanation is rejected. The continuous retry/allocation paths correlate with worsening frame time, but the exact source of all retained Lua memory is not claimed proven.

Revision 9 addresses the evidenced repeated work before changing global GC or Wasm memory policy. It does not globally renumber mesh maps: LÖVE table-form maps are one-based while Data-form maps legitimately use zero-based raw indices. At the exact PotatoVoxel ID/path/source only, it converts `SpriteBillboards.buildShadowBlob`’s one Lua table map, adds a broken-session early return and first-failure traceback to `OverworldBattle`, and latches only the actor-decal pass off after one detailed failure. `Voxel3D.pushQuad` and unrelated paths remain unchanged.

`tools/test_potato_voxel_compat.py` pins the exact official v1.4.4 ZIP at SHA-256 `f9bedd5c1ed1074427fb5a6e3d5acac501f0cc0fba7be3c5516d12abecbb2c64`, extracts the three publisher files, applies exactly 1/2/3 guarded changes respectively, proves the same SpriteBillboards source under another mod ID remains byte-identical, and compiles all transformed output under official PUC Lua 5.1.5. The test passed. This is exact-source/path/compile evidence, not a real-device frame-time result.

### Runtime work reduction

`modPackageFiles()` now derives byte/file bounds and launch contents from enabled mods only; `native_mod_state.json` still mirrors the complete installed library. `tools/test_mod_packaging.ts` passed disabled packed/expanded payload exclusion, state preservation, and next-launch re-enablement. This reduces launch/package/Wasm-side work without deleting or forgetting disabled installs.

The browser queues diagnostics behind one Promise chain and posts at most 48 entries or 40 ms per native envelope; fatal records force handoff. Native accepts at most 128 records per envelope and appends ordered approximately 64 KiB / 75 ms batches asynchronously. One failed async append receives one intact synchronous batch fallback. Session end, export, clear, and terminal cleanup await pending work. `tools/test_diagnostic_batching.ts` passed native/Web order, coalescing, whole-batch fallback, terminal durability, complete TXT export, and no per-record append regression.

Periodic save mirroring now compares sorted allowed path/size/mtime inventory before reading or Base64-encoding any files. An unchanged periodic inventory skips the payload; final `syncfs` snapshots still collect every allowed file. `tools/test_runtime_performance_guards.py` passed the diagnostic bridge/native batch, unchanged-save/full-final-save, and enabled-only payload source contracts.

### Revision-8 component migration

Before normal asynchronous selection, a valid revision-8 installed pair is verified and regenerated locally as revision 9 around the same immutable installed core. Layer/state staging, backup, commit, post-commit verification, and rollback are transactional. Success returns `migration.status = "upgraded"`; failure restores exact old bytes/state, returns `failed-bundled-fallback`, and selects the complete bundled pair because a revision-8 layer cannot satisfy the current runtime contract. `tools/test_execution_layer_migration.ts` passed success, injected post-backup failure, exact revision-8 byte/state restoration, and complete bundled-pair fallback.

The current deterministic bundled component is `runtime/gen1recomp-layer-2.1.0.love`: 312,056 bytes / 14 files / SHA-256 `d0f9fbc9af9e2d11a26ad1a3c5639205c8d32f62941d7fc3847249d69314ca71`, bound to unchanged core SHA-256 `4dfd6e78808024eda0cce8b9fa5434a5846d1aa327912f7a1ce3c888e416c4fe`. `tools/test_compatibility_pack.py` passes revision 9, per-file integrity, exact eleven-target effective view, updater ownership, PotatoVoxel guard presence, and immutable-core identity.

## Retained 3.4.0 implementation evidence

### Known-good source recovery

Before editing, the old workspace source directory was found to differ from its own v3.3.0 manifest and failed 12 validator checks. The delivered archive still matched the user-confirmed identity exactly: 6,799,603 bytes, SHA-256 `4f5c3a148af993098795b44c16f825b49947a554694b52dabb7db5cf68a2ce16`, 63 deterministic entries. The v3.4.0 tree was therefore initialized by extracting that immutable archive, not by copying the drifted directory. The fresh extraction passed all 250 v3.3.0 checks and its engine matched 4,399,348 bytes / SHA-256 `503542391bd1709ebdb87644ac50b51ddd49fcd70231a36668e0b3a620a2fe13` before v3.4 changes.

### Worker-backed archive preparation

Current official Scripting docs explicitly state that `Thread.runInBackground` is for CPU-heavy work and returns results to the initiating thread, while async `FileManager` methods perform I/O in the background. Machine-readable official metadata does not mark either surface PRO. Production now uses off-main parse, bounded scan, bounded CRC/DEFLATE verification, schema extraction, archive-backed repack, component hashing, and engine patching; progress callbacks execute only between awaited batches on the initiating thread.

`tools/test_mod_preparation.ts` executed production `prepareModArchive` through the documented-host shim. A wrapper ZIP with manifest, literal schema, code, and 96 KiB binary payload used at least four worker calls; scanning/verifying/packing each emitted exact start/completion progress; async output wrote one normalized package; independent production read/extract recovered every payload byte. This proves pipeline/control invariants in the shim, not real iPhone thread transfer cost, progress rendering, thermal behavior, or interruption.

### Bounded binary transport

Native 3.4 launch code has no `Data.combine(parts)`, generated `packageBase64`, or generated `wasmBase64`. It writes deterministic local scripts capped at 1,048,576 decoded bytes. Browser transport preallocates exact arrays and validates strict kind/index/offset/decoded length before direct copy; a one-shot consumer clears the transport reference. The Emscripten data packager still copies package bytes into Wasm memory, so the design reduces encoded/raw/native overlap but is not called zero-copy.

`tools/test_binary_transport.mjs` ran the production script under Node’s VM and passed exact WASM/package reconstruction, deterministic script order, completion status, one-shot release, incomplete/repeated rejection, out-of-order rejection, and external-script-name rejection. A real WKWebView peak-memory and startup comparison remains a named device test.

### Persistent launch recovery

`modules/runtime-recovery.ts` atomically renames a small private marker and owns cleanup by session ID. `tools/test_runtime_recovery.ts` passed clean commit/no-temp-debris, refusal to clear another session’s marker, owning-session cleanup, interrupted marker plus recursive private-directory recovery, and malformed-marker fail-closed removal. This does not prove iOS will execute while terminated; it proves only next-run recovery once Scripting runs again.

### Immutable core and revision-8 executable layer

The retained 3.4.0 baseline introduced the exact official v0.1.78 core as `runtime/gen1recomp-core-0.1.78.love`: 4,418,896 bytes, SHA-256 `4dfd6e78808024eda0cce8b9fa5434a5846d1aa327912f7a1ce3c888e416c4fe`. It was not `/game.love`, and no reconstructed patched core was packaged. Its separately versioned source was `runtime/gen1recomp-layer-2.0.0.love`: 306,051 bytes, 14 files, SHA-256 `9747747700041467aab4a19a529bdb07d07744596d336b70e2496a370836d62e`.

`tools/test_compatibility_pack.py` independently proved 453 exact upstream files, no suite markers in core, only the 14 allowed layer files, unchanged core bytes before/after effective-view construction, and exactly eleven effective targets equal to the schema-2 rule set. `tools/test_execution_layer.mjs` generated the layer twice byte-identically from the official core, verified broker/manifest structure, and proved generation did not alter the source digest. The Python build front end invokes that same production TypeScript function and verifies both pinned output and post-build core identity.

Official LÖVE 11.5 boot ordering is now exercised rather than merely described. In a fresh Chromium 140 direct-file package, `/game.love` was 306,051-byte layer v2.0.0 and `/gen1recomp-core.love` was the separate 4,418,896-byte core. The real runtime printed the mounted layer/revision/core/SHA marker, verified executable precedence, entered the core, set title `gen1recomp v0.1.78`, resized to 390×844, and emitted Lua/graphics telemetry. There were zero page errors and zero HTTP/HTTPS requests.

Four independent fresh runs exercised failure/containment boundaries. Flipping one core byte produced `[gen1-layer:core-digest]` before the precedence/entry marker. Omitting the core file produced `[gen1-layer:core-absent]`. Injecting `error("SAVE INJECTION EXECUTED")` at the writable identity's `src/mods/Loader.lua` still reached the normal layer/core path; the marker never ran. The updater fixture additionally injected a malicious writable `src/update/Boot.lua`, `updates/pending.txt`, and an archive whose `Version.lua`/`main.lua` print execution markers. No malicious marker ran; layer-owned `Boot.run` logged `[gen1-layer:update-policy] removed 1…`, removed both pending/archive paths, and the immutable core reached the normal title. These are desktop Chromium/LÖVE/Wasm results—not Scripting/WKWebView device evidence.

Engine revision 8 retains future downloaded source bytes beside a generated small layer, requires strictly increasing engine versions, and transactionally backs up/rolls back both. Revision-7 materialized state cannot activate. An absent/corrupt installed pair falls back as a unit to the pinned bundled layer/core pair. `tools/test_execution_layer_install.ts` also generated layer 2.0.1 around the unchanged core, installed it independently, verified exact activated bytes, rejected same-version and wrong-core layers, injected a rename failure after backup and proved rollback to 2.0.1, proved corruption falls back to bundled 2.0.0, and reset only the layer. Real device filesystem transactions remain named device checks.

### Telemetry and low-memory policy

Browser bootstrap now records capability probes; ten-second diagnostics record frame fields, Wasm heap, optional JS heap, and transport state. Lua reuses one `love.graphics.getStats` table and reports Lua KiB plus draw/batch/canvas/object/texture fields every ten seconds. The existing Web low-memory callback performs one emergency full collection and reports post-collection Lua KiB. No Lua 5.1 pause/step tuning, LuaJIT, Lua 5.5 VM, LÖVE 12, WebGPU, pthread, or Wasm-exception migration was enabled without measurements/compatibility evidence.

## Completed static checks

### Instruction lock

```sh
cd /home/user && python3 tools/verify_instruction_lock.py
```

Result: `agent.md` and `skills.md` match their locked SHA-256 values.

### Project validator

```sh
python3 tools/validate_project.py
```

The validator checks:

- required project structure, worker/recovery/transport/compatibility/performance-regression files, and parseable 3.5.0 `script.json`;
- strict catalog schema, bundled engine/runtime identities, featured-mod source, and bounded performance profiles;
- full-screen four-tab UI, upper-left close actions, dedicated Mods/Settings surfaces, determinate localized Download Manager cards/controls, mod-health/`LOAD REPORT` UI, persistent complete console diagnostics with TXT/JSON/JSONL/CSV export and clearing, opt-in scheduling, Update Center actions, and localized-string shape;
- engine/core/independent-layer/runtime state selection, revision-8-to-9 migration/rollback/fallback markers, digest/size/core-binding/per-file-manifest checks, monotonic layer versions, layer and coupled runtime rollback markers, no-pthreads runtime validation, and shared streamed persistent asset transport with six-attempt retry, pause/cancel/resume, exact Range/Content-Range, clean-200 restart, expected size, and SHA-256 gates;
- pinned hashes for Gen1Recomp, love.js, LÖVE WASM, direct-injection loader, bit module, and retained licenses;
- WebAssembly magic/version and expected size;
- readable source-layer `.love`, all twenty-two compatibility/policy contracts—including layer-owned updater blocking, packed mounting, missing-stamp protection, cooperative transforms, strict terminal-continue compatibility, wrapped self-module `loadstring`, exact Wilds and PotatoVoxel source guards, first-failure Lua diagnostics, schema-2 option normalization/precedence/write-back, and post-save observation—and absence of ROM/save payloads;
- canonical Red/Blue/Yellow/Gold SHA-1 identities;
- local runtime dependency closure and `connect-src 'none'` CSP;
- launch-script/WASM injection wiring and absence of XHR/fetch/package IndexedDB caching;
- documented `loadFile` host wiring, temporary-payload cleanup, ordered bounded Web/native diagnostic batching and terminal flushes, unchanged periodic-save suppression with complete final snapshots, enabled-only mod payload selection with a complete state mirror, Lua-log mirroring, post-snapshot cache invalidation, and stale-mod-tree removal;
- self-contained ZIP/DEFLATE/CRC/repack markers, independent 40,000-entry / 32,768-file archive / 49,152-file installed limits, root/one-wrapper package-manifest discovery, cooperative progress yields, integrity-pinned packed staging, legacy-directory support, strict GitHub URL parsing, compressed-payload-preserving engine updates, mandatory digest updates, genuine runtime packaging, declarative schema extraction without execution, bounded state/default/profile semantics, native toggle/choice/number/text editors, runtime-discovery guidance/reset UI, and absence of every host archive primitive;
- absence of server/listener/loopback primitives in executable source and the validation host shim;
- no bundled generated `launch.js`, ROM, save, state, IPA, or third-party mod;
- local cover PNG identity/dimensions, third-party license presence, and an exact all-file `MANIFEST.sha256`.

Current 3.5.0 source result after 78-entry manifest regeneration: `PASS 310 checks`. Final 3.3.0 remains the target-device-confirmed rollback at `PASS 250 checks`; retained 3.4.0 automated validation was `PASS 293 checks`, and the finalized 3.2.9 baseline was `PASS 236 checks`.

### TypeScript and syntax diagnostics

```sh
npx --yes -p typescript@5.9.3 tsc -p tsconfig.validation.json --pretty false
python3 -m py_compile tools/validate_project.py tools/build_web_love.py tools/build_runtime_bundle.py tools/test_wilds_compat.py tools/test_lua_error_diagnostics.py tools/test_update_boot_policy.py tools/test_mod_option_bridge.py tools/test_runtime_alert_policy.py tools/test_runtime_performance_guards.py tools/test_potato_voxel_compat.py
node --check runtime/game-loader.template.js
for test in test_rom test_mods test_mod_options test_downloads test_execution_layer_install; do
  npx --yes esbuild@0.25.5 "tools/${test}.ts" --bundle --platform=node --format=esm \
    --alias:scripting=./tools/scripting-node-stub.ts --outfile="/tmp/${test}.mjs"
  node "/tmp/${test}.mjs"
done
npx --yes tsx@4.20.3 tools/test_zip.mjs
node tools/test_binary_transport.mjs
for test in test_mod_preparation test_runtime_recovery test_execution_layer_migration test_mod_packaging test_diagnostic_batching; do
  npx --yes esbuild@0.25.5 "tools/${test}.ts" --bundle --platform=node --format=esm \
    --alias:scripting=./tools/scripting-node-stub.ts --outfile="/tmp/${test}.mjs"
  node "/tmp/${test}.mjs"
done
python3 tools/test_runtime_performance_guards.py
python3 tools/test_compatibility_pack.py
npx --yes tsx@4.20.3 tools/test_execution_layer.mjs runtime/gen1recomp-core-0.1.78.love /tmp/gen1-layer-check.love
python3 tools/test_update_boot_policy.py /tmp/lua-5.1.5/src/lua
python3 tools/test_mod_option_bridge.py --lua /tmp/lua-5.1.5/src/lua
python3 tools/test_lua_error_diagnostics.py /tmp/lua-5.1.5/src/lua
python3 tools/test_runtime_alert_policy.py
python3 tools/test_wilds_compat.py /tmp/Wilds.of.Kanto.v1.12.2.zip /tmp/lua-5.1.5/src/lua
python3 tools/test_potato_voxel_compat.py --lua /tmp/lua-5.1.5/src/lua \
  --potato /home/user/references/potato-voxel/v1.4.4/potato_voxel-1.4.4.zip
```

Results:

- TypeScript: no diagnostics against the expanded validation-only documented-host shim, including the newly used `TabView`, `Label`, `Picker`, `Toggle`, and `useEffect` symbols;
- Python/JavaScript syntax checks: pass;
- synthetic ROM validation suite: `ROM validation tests passed`;
- pure mod manifest/path/payload/repository/version suite: `Mod validation tests passed`;
- native option parser/state suite: bounded literal parsing, executable-syntax rejection, normalization, persistence recovery, version reconciliation, explicit-value precedence, profile reselection, per-mod reset suppression, and exact missing-default semantics passed;
- persistent PUC Lua 5.1 bridge: schema export, versioned migration, managed/profile/explicit precedence, reset/default restoration, and post-save write-back passed for toggle/choice/number/text; PotatoVoxel’s canonical boolean-false SHADOWS choice, object-form false choices, `maxLength`, and valid siblings beside a malformed row passed;
- persistent download manager: streamed chunks, observable retry/verifying states, connection-loss Range+If-Range resume, matching Content-Range, ignored-Range `200` clean restart, malformed/mismatched `206` zero-byte restart, pause/resume, active and queued cancel, cancelled-ID reuse, completed discard, wrong size/hash rejection, process-reload reconciliation, corrupt-primary backup recovery, and interrupted queue-commit rollback passed;
- exact caught-alert policy: the `Invalid vertex map value: 0` → generic alert → subsequent `actor decal pass aborted` fixture no longer has a generic-alert dismissal path, while abort/exit/window-error/unhandled-rejection terminal reasons remain;
- local ZIP suite: stored ZIP writing, stored/fixed/dynamic/level-zero raw DEFLATE, UTF-8/CP437 names, symlink/encryption/corruption rejection, CRC-32, and truncation tests passed;
- bounded transport: exact reconstruction/order/release and malformed/external-name failures passed;
- worker mod preparation: background-stage count, exact progress completion, async write, normalized paths/order, and binary byte identity passed;
- runtime recovery: atomic marker, session ownership, interrupted directory cleanup, and malformed-marker recovery passed;
- enabled-only mod packaging: disabled packed/expanded bytes were absent, the complete installed state mirror remained, and native re-enablement selected the payload on the next launch;
- diagnostic batching: ordered native/Web records, envelope coalescing, one whole-batch fallback, terminal durability, complete TXT export, and append-count bounds passed;
- runtime performance guards: bounded Web/native diagnostic batches, unchanged periodic-save suppression, complete synchronized final saves, and enabled-only payload selection passed;
- revision-8 migration: success retained the exact verified core; injected failure restored exact old layer/state and selected the complete bundled pair;
- exact PotatoVoxel v1.4.4 compatibility: official archive digest, exact 1/2/3 path/source rewrites, alternate-path identity, and official PUC Lua 5.1.5 compilation passed;
- execution-layer boundary: exact revision-9 layer/core hashes, 453 unchanged upstream files, 14 allowed layer files, deterministic generation, 13 internal per-file SHA-256/size records, core identity before/after, and exact eleven-target effective difference passed;
- independent layer component: newer-layer install around unchanged core, activated-byte hash, same-version/wrong-core rejection, injected mid-transaction rename rollback, corruption fallback, and independent reset passed;
- layer-owned updater: PUC Lua 5.1 pure-selector compatibility, preflighted pending read, bounded cleanup, zero mount/load execution, plus Chromium writable Boot/pending/archive non-execution and removal passed;
- Python’s independent standard-library `zipfile` reader accepted the locally written Unicode/nested save ZIP and verified every payload byte.

The shim includes documented `WebViewController.loadFile(path, allowingReadAccessTo)`, `addScriptMessageHandler`, `dismiss`, `dispose`, binary data/file, picker, cryptographic, navigation, `FileManager.appendTextSync`/`appendDataSync`, `Response.dataStream`, `AbortController`, and `DocumentInteraction.optionsMenu` symbols. It deliberately contains no `Archive` declaration. This does **not** equal compilation against declarations synchronized from a current Scripting device; no device was connected.

### 3.3.0 target-device exit diagnosis and caught-alert regression

The supplied 247,414-byte/3,100-line Settings TXT export is genuine target-device evidence from suite 3.2.9. It records installed Gen1Recomp 0.1.80, enabled PotatoVoxel 1.4.4, `game loaded`, and `VERMILION_CITY`. At +9.946 seconds LÖVE printed `Invalid vertex map value: 0`; Davidobot’s customized Emscripten exception path immediately emitted `An error occurred before the game window could be initialised. Please check the console!`; 3.2.9 sent `browser-alert-after-ready` and dismissed. Records after that alert repeatedly say `[PotatoVoxel] actor decal pass aborted`. PotatoVoxel’s exact `VoxelScene.lua` wraps that pass in `pcall`, so those later records prove Lua caught the exception and the game loop continued. This is not an uncaught Lua crash.

3.3.0 changes both layers: `runtime/index.html` records a post-ready generic alert as `caught_exception_alert`/`caught_exception_alert_retained` warning and sends no close request; `modules/player.ts` defensively ignores only a legacy post-ready generic-alert close reason. Emscripten abort/exit and uncaught window/promise reasons remain independent close signals. `tools/test_runtime_alert_policy.py` binds the exact vertex/alert/continued-log fixture to these invariants. This is deterministic source-policy evidence; continued gameplay still requires the target-device checklist.

### 3.3.0 exact PotatoVoxel v1.4.4 dynamic-schema reproduction

The exact 705,060-byte release ZIP was checked against publisher SHA-256 `f9bedd5c1ed1074427fb5a6e3d5acac501f0cc0fba7be3c5516d12abecbb2c64`. Exact official Gen1Recomp 0.1.80 was independently checked against GitHub SHA-256 `3e69eb7de7679bd463aa4897743b9b1715a7bc90f7c8966ece239479dd59bd23`. Under a locally built LuaJIT 2.1 headless engine harness, PotatoVoxel loaded with 0 errors and passed its 104/104 upstream checks. Its generated Web schema contains 12 rows.

The previous normalizer used `type(rawChoice) == "table" and nativePrimitive(rawChoice[2]) or nil`. For the SHADOWS tuple `{ "OFF", false }`, Lua’s `false or nil` yields nil, rejecting the row; the old all-or-nothing function then rejected all twelve. The revised normalizer uses explicit assignment, accepts canonical tuples and bounded object spelling, and skips only malformed rows. Patching exact 0.1.80 and rerunning exact PotatoVoxel produced `schemas.potato_voxel.version = 1.4.4` with 12 rows: renderScale, grid, curve, water, atmos, battles, battleBack, stadiumSprites, daytime, aa, shadows, and shadowQuality. SHADOWS retained ON/true and OFF/false. The resulting bounded native mirror was 5,403 bytes. The packaged PUC-Lua regression contains the boolean-false structure without bundling PotatoVoxel code.

### 3.3.0 persistent download-manager evidence

Current official Scripting documentation confirms `Response.dataStream` yields native `Data` chunks, `FileManager.appendDataSync` persists them, `AbortController` cancels fetch, and determinate `ProgressView` accepts `value`/`total`. `modules/downloads.ts` uses those free-tier surfaces; it contains no `Archive`, server, socket, or background-transfer claim.

`tools/test_downloads.ts` runs the production manager against the filesystem/Crypto/fetch host stub. It passed: connection loss after four of ten bytes followed by exact `Range: bytes=4-` + ETag `If-Range` + matching `206`; ignored Range returning `200` with truncation before full-body write; malformed and mismatched `206 Content-Range` responses followed by verified byte-zero restarts; active pause/resume; active cancel; serial queued cancel without a network request; reuse of the cancelled ID after its promise settled; completed-record discard; declared-size and SHA-256 failures with untrusted-byte removal; and observable retry/verifying states.

The startup fixture placed an interrupted `downloading` record and three real partial bytes behind a corrupt `downloads.json` and valid fixed `downloads.backup.json`. A fresh one-time load recovered the backup, reconciled the byte count from the file, converted the job to paused, installed repaired primary JSON, and removed transaction debris. A separate injected failure during `downloads.tmp.json` → primary rename restored the previous primary byte-for-byte. A live GitHub probe against PotatoVoxel’s asset returned `206`, `Accept-Ranges: bytes`, `Content-Range: bytes 1000-1999/705060`, and exactly 1,000 requested bytes.

These tests prove the manager’s state machine and byte invariants in the host stub and live HTTP semantics, not long-running background transfer or real Scripting filesystem/network behavior. Poor-Wi-Fi, suspension, native process termination/reopen, progress rendering, and transactional handoff remain device checks.

### 3.2.9 target-device report and navigation regression

The user confirmed that packaged 3.2.8 works on the target Scripting device and that the native Mod settings editor opens and is usable. The same report identified one concrete host-UI defect: no visible Back button was available to return from the editor to the installed Mods list. This is direct device evidence for import/start/editor reachability, but not evidence for every control type, runtime write-back, reset, accessibility mode, or the still-unknown Route 2 failure.

The 3.2.9 source now provides three aligned escape paths:

1. one stable `topBarLeading` `Button` changes from root Close to editor Back without conditionally replacing the toolbar node;
2. a prominent in-content Back button is rendered before the mod title and calls `setEditingModOptions(null)` directly;
3. a separate in-content Close button calls the root `dismiss` function.

The project validator requires the in-content labels, icons, and exact state/dismiss actions independently of the toolbar. TypeScript validation covers the changed TSX structure. These structural checks cannot prove how the installed Scripting build lays out or taps the controls; that final two-action check remains in `DEVICE_TEST_CHECKLIST.md`.

### 3.2.8 native mod-option parser/state regression

`tools/test_mod_options.ts` runs the production parser/state manager against an in-memory implementation of Scripting’s documented `Data`/`FileManager` surface. The suite passed:

- Wilds’ exact 18-row literal `options.lua` plus comments, long strings, keyed/array tables, choice arrays, numeric bounds, and a no-final-newline form;
- rejection of a local declaration/function call before `return`, arithmetic/call expressions, nonliteral identifiers, trailing statements, malformed tables, duplicate/reserved keys, non-finite or invalid numeric rows, duplicate choices, excess rows/choices, and oversized serialized state—without evaluating any fixture;
- exact fallback defaults matching Gen1Recomp: toggle `false`, number `0`, first choice, text `""`, text max length `7`;
- atomic `.tmp`/backup writes, corrupt-primary backup recovery, schema/value sanitization, installed-version reconciliation, stale dynamic-schema invalidation, and shared value preservation on uninstall;
- schema-2 boot-envelope precedence: known keys are cleared, unsuppressed profile values seed first, and explicit values win last;
- per-mod restore-default behavior: explicit values are removed and profile seeding is suppressed for that mod; deliberate profile selection clears suppression and explicit values only for the selected profile’s managed keys.

The exact fixture audit observed Wilds of Kanto 1.12.2 = 18 rows, Kanto Life 0.6.1 = 10, Kanto Ascendant 6.0.11 = 45, and Dramatic Shape 1.8.2 = 14. Literal Wilds discovery succeeded at import; the three generated/runtime-defined schemas correctly remain unavailable until genuine Gen1Recomp captures them. Counts are not hardcoded into production UI.

### 3.2.8 persistent Lua 5.1 option-bridge regression

`tools/test_mod_option_bridge.py` builds a persistent Lua harness from the exact patched `Loader.lua` and `SaveData.lua` inside the current engine, then executes it with independently built official PUC Lua 5.1.5. It passed schema normalization/export, exact fallback defaults, profile and explicit precedence, once-known migration from upstream `options.lua`, per-mod reset suppression, and write-back after genuine save. Toggle, number, choice, and text values all round-tripped through `native_mod_options.json`; malformed/out-of-schema data remained bounded or was declined. Both patched source files also pass `luac -p` under PUC Lua 5.1.5.

This is a real persistent-Lua bridge test but not a WebAssembly/WKWebView/native-TSX test. The native editor has not yet been tapped in Scripting.

### 3.2.5 persistent-console host test

A disposable filesystem/Crypto/Scripting mock executed `modules/diagnostics.ts` without changing the project. It opened a dashboard-style session, appended native context and a full `Error` stack, accepted a 25,001-character three-part Web console event, rejected no valid part, rejected malformed typed chunk metadata with an explicit warning, read the persistent JSONL, calculated session/event/error/byte summaries, generated TXT/JSON/JSONL/CSV exports, and cleared both journals. Every format retained all three message parts and the exact `exact failure` text; CSV safely prefixed a formula-leading test cell without dropping its text. A synthetic unterminated crash tail remained exportable as one malformed record while the next session began as valid independent JSONL. The mock and generated files were removed.

Static/runtime source checks additionally established:

- the browser bootstrap is installed before generated/runtime scripts and wraps `debug`, `log`, `info`, `warn`, `error`, `trace`, assertions, directory/table/group/time/count methods, and clear;
- `window.error`, unhandled rejections, Emscripten abort/exit, browser alerts, WebGL context events, package metadata/decoding/file injection, LÖVE output, runtime status, native launch/request/save/cleanup stages, and native error stacks all have explicit event paths;
- the former 400-character cut is absent; browser text is split at 12,000 characters and every numbered part is append-only persisted;
- rotation occurs only before a session at 8 MiB, preserving the whole active failing session rather than trimming it during failure;
- suite-generated export context contains no ROM bytes, save contents, original ROM filename/hash, or cover data, while the UI warns that third-party console output may itself expose technical paths or gameplay state;
- export files use the temporary directory, are presented through the documented `DocumentInteraction.optionsMenu`, and are deleted in `finally`.

### 3.2.5 diagnostic/player Chromium regression

A fresh Chromium 140 direct-file run used the production 3.2.5 HTML/CSS/loader, unchanged pinned engine, local love.js/WASM, and private canonical Yellow fixture at 390×844. Instrumented mock message handlers received 40 diagnostics spanning bootstrap, metadata, Base64 decode, filesystem preparation, package processing, every injected package file, runtime initialization, and `game_loaded`. Genuine gameplay reached ready state in 12.665 seconds with zero page errors, native browser dialogs, or HTTP/HTTPS requests.

After ready, a synthetic 25,001-character `console.error` was recovered byte-completely from three parts whose maximum size was exactly 12,000 characters. A synthetic browser alert created no blocking browser dialog and emitted `browser-alert-after-ready`; explicit `Module.onExit(0)` emitted `emscripten-exit`. Both requested player close. A separate fresh before-ready run converted a synthetic alert into the visible fatal panel, recorded both `alert` and `fatal_panel`, and the panel button emitted `fatal-close-button`, again with zero page errors/dialogs. A third run forced the first close handler call to reject; the panel remained visible, a complete `close_rejected` event persisted, and a second button press issued a second clean close request with no page error. A fourth run deliberately mismatched validated package size: `base64_decode_failed`, `package_error`, the complete stack, and the fatal panel all appeared with no dialog or page error. Playwright cannot prove Scripting’s native `controller.dismiss()` presentation transition; that remains a named device step.

### Real-device 3.2.5 TXT diagnosis

The user installed 3.2.5 on the target iPhone and exported `Gen1Recomp-Console-2026-08-12T20-18-26-152Z.txt` through Settings. It is 893,371 bytes / 11,247 lines and contains 3,735 parseable diagnostic records, including two Wilds-active failures followed by a Wilds-inactive success. This is real Scripting/WKWebView evidence for the captured paths, not simulated browser output.

Both failing sessions completed native component verification, decoded 4,720,510 WASM bytes, processed the 40,700,719-byte injected package, loaded `overworld_wild_spawns 1.12.2`, Deutsch, GameShark Compatibility, and PotatoVoxel, reached `[info] game loaded` plus native ready, and committed an initial save snapshot. The first then emitted `No suitable image encoder for rgba4 format` at `20:16:51.585Z`, 4.415 seconds after ready. The generic alert followed, and Wilds attributed `map.entered error: mods/overworld_wild_spawns/lib/spawn_render.lua:-1: attempt to call a nil value`; 23 ms later the same encoder/alert sequence and nil-call attribution occurred for `save.loaded`. Native coalesced the second close, dismissed the player, completed final IDBFS/native save sync, disposed the controller, deleted the ROM-bearing temporary runtime, and ended the session. The second launch repeated the same event order within comparable timing.

Those sessions injected a 157-byte `native_mod_state.json`. The third injected 158 bytes after Wilds was disabled. Its package remained installed/mounted, but no `loaded mod overworld_wild_spawns` entry ran; Deutsch, GameShark Compatibility, and PotatoVoxel still loaded. It reached ready, loaded the Route 2 save, remained open through the ten-second metric window, committed saves, closed cleanly, and ended with `hadRuntimeError:false`. No generic alert, encoder message, Wilds callback error, WebAssembly failure, package error, or core Gen1Recomp failure occurred. This enabled/disabled split is the causal evidence that the report is a Wilds compatibility path rather than a ROM, WASM, package, or base-engine initialization failure.

The export also proves that complete Settings TXT handoff, persistent native/Web records, alert capture, after-ready native dismissal, final save sync, controller disposal, and temporary runtime cleanup worked for these sessions. It does not by itself prove every export format, clear/rotation, explicit in-game EXIT, or the new 3.2.6 guard. As the UI warns, the complete log contains technical iOS container paths and gameplay/map state and must be inspected before sharing.

### Real-device 3.2.6 guard confirmation and masked Lua error

The user then installed 3.2.6 on the same target iPhone/iOS 18.7 and exported `Gen1Recomp-Console-2026-08-12T20-56-05-762Z.txt`. It is 312,465 bytes / 3,962 lines. The session selected bundled Gen1Recomp 0.1.78 and bundled LÖVE 11.5, reached native ready at `20:54:25.653Z`, and remained in genuine Route 2 gameplay until the alert at `20:55:58.239Z`.

This is positive device evidence for the Wilds hotfix:

- `[native-compat] guarded unsupported ImageData PNG encode: @mods/overworld_wild_spawns/lib/spawn_render.lua` executed on target WKWebView;
- Wilds prepared 1,298 runtime sheets, registered all 151 sprites, validated 649 follower mappings, and loaded v1.12.2;
- the Route 2 save loaded, wild entities spawned, and two Wilds battles completed;
- no `No suitable image encoder for rgba4 format`, `spawn_render.lua:-1`, or prior Wilds callback recurrence appears.

The later fatal sequence is different. Immediately before the alert, LÖVE printed `Could not open file lua-error.log. Does not exist.` No browser exception, unhandled rejection, Emscripten abort, or exit was recorded. The alert text claimed a pre-window initialization failure even though genuine gameplay had been ready for about 92.6 seconds.

Exact v0.1.78 source shows `main.lua` wraps `love.errorhandler` with `SwitchDiagnostics.logLuaError(msg)`. Exact `src/debug/SwitchDiagnostics.lua` unconditionally calls `filesystem.read("lua-error.log")` before its first write. The log is optional and absent on the first Lua failure, so the logging path itself constructs a secondary `love::Exception` and fails before preserving the originating message.

Davidobot’s historical Emscripten source explains the misleading browser behavior. Commit `f64636ac516eed78aeccef94575e7a285faaa296` added code in `src/common/Exception.cpp` that, under `LOVE_EMSCRIPTEN`, prints every exception message and invokes the fixed generic alert from the exception constructor itself. This is not stock LÖVE 11.5 behavior and is not limited to truly pre-window failures. Commit `e9163e085b7492890916e5410f49cd46c8fb6394` later added a console newline; the generated love.js rebuild is commit `2c6c6049c468347c94d47ee74cf053313da24525`.

Therefore the trace proves an unseen originating Lua exception reached the error handler, but it does **not** identify that exception. The nearby Kanto Life `unknown sprite SPRITE_BUG_CATCHER` entry had been caught earlier and gameplay continued; nearby Wilds spawns likewise do not establish causality. Version 3.2.7 deliberately fixes the diagnostic masking before changing any mod or gameplay behavior.

### Exact Wilds 1.12.2 source and encoder regression

The exact public release asset was re-downloaded from GitHub, matched 13,745,457 bytes and SHA-256 `7272a62c7d72f069295281835c0a6cdbaccd2bcf0c24b2b8284c90b9d68a8e3b`, and remained outside the project. `lib/spawn_render.lua` is 91,263 bytes. Its optional `bakeSheet` calls `canvas:newImageData()` and then `idata:encode("png")`; Wilds’ main chunk compiles that module itself via `loadstring(mod:read(...), "@" .. mod path)`. That explains why the older global string-`load` wrapper did not see the module.

Official LÖVE 11.5 `ImageData.cpp` throws `No suitable image encoder for <format>` if no handler accepts the raw format. Official `magpie/PNGHandler.cpp` accepts PNG only for `PIXELFORMAT_RGBA8` and `PIXELFORMAT_RGBA16`; `rgba4` is valid ImageData but not PNG-encodable. The hotfix therefore does not suppress an arbitrary error. At the exact `@mods/overworld_wild_spawns/lib/spawn_render.lua` compile path and exact v1.12.2 anchor, it inserts a `getFormat()` capability check. Unsupported formats return `nil` through Wilds’ already-handled optional bake fallback; supported formats continue unchanged. The installed/public ZIP and publisher Lua bytes are never rewritten.

The committed reproducible test ran:

```sh
python3 tools/test_wilds_compat.py /tmp/Wilds.of.Kanto.v1.12.2.zip /tmp/lua-5.1.5/src/lua
```

It extracts the patched bootstrap and executes it with official PUC Lua 5.1.5 against the exact module:

- exactly one image guard was applied; no continue rewrite occurred;
- the resulting 91,564-byte source compiled successfully;
- a second pass was byte-idempotent and applied zero guards;
- the same source under an unrelated module path was byte-identical;
- a mocked exact `bakeSheet` with `rgba4` made zero encoder/write calls and returned `nil`;
- the same function with `rgba8` made exactly one encode and one write and returned the expected cache path.

A fresh Chromium 140 baseline then used the production 3.2.5 engine, exact Wilds contents, canonical private Yellow, and a temporary API-2 probe that forces only Wilds’ 16×16 default Canvas to readable `rgba4`. It reproduced the generic alert, `No suitable image encoder for rgba4 format`, visible fatal panel, and absence of the probe success marker with zero page errors/dialogs/network requests.

The same fixture under the rebuilt engine printed one `[native-compat] guarded unsupported ImageData PNG encode` marker, mounted and loaded exact `overworld_wild_spawns 1.12.2`, forced the same Canvas to `rgba4`, completed Wilds’ `LOADED` fallback path, and reached genuine gameplay at 390×844. It produced 75 captured diagnostics and zero browser alerts, Wilds errors, nil-call/encoder errors, close requests, page errors, dialogs, or HTTP/HTTPS requests. The final qualification took 16.495 seconds including the post-success observation window. All temporary probe packages, normalized public fixtures, browser profiles, generated launch data, and private ROM-bearing payloads are excluded from the project/deliverable and removed after final qualification.

These PUC/Chromium tests cover the exact source and forced failure condition. The user’s 3.2.6 target-iPhone trace now establishes the guard under WKWebView with the persisted Route 2 save and full mod combination, including subsequent spawning and two battles. It does not establish long-session stability because a different unrecorded Lua exception later entered the broken first-use diagnostics path.

### 3.2.7 first-failure diagnostics regression

The committed reproducible behavior test ran the isolated patched `SwitchDiagnostics.lua` under independently built official PUC Lua 5.1.5:

```sh
python3 tools/test_lua_error_diagnostics.py /tmp/lua-5.1.5/src/lua
```

It established that an absent first `lua-error.log` causes zero reads of that path, writes the first redacted record plus engine identity, appends a second record through exactly one existing-file read, rotates history larger than 32 KiB into `lua-error.log.1`, and still redacts binary-looking control-byte content. `luac -p` accepted both the final patched `main.lua` and `SwitchDiagnostics.lua`.

The engine now computes `debug.traceback("Unhandled Lua error: " .. message, 2)`, prints it as `[native-lua-error]` before calling `SwitchDiagnostics.logLuaError`, and only then enters normal upstream error-screen handling. `runtime/index.html` promotes that marker to explicit error status and schedules `snapshotWithoutSync` on the next JavaScript task. The snapshot collector and native path validator admit only exact `lua-error.log` and optional `.1`; all other unknown top-level paths remain rejected, with existing 8 MiB per-file / 24 MiB aggregate / staging replacement limits unchanged.

A fresh Chromium 140.0.7339.16 run used the production 3.2.7 HTML/CSS/loader, rebuilt engine, bundled love.js/WASM, and private canonical Yellow fixture at 390×844. Genuine Gen1Recomp reached ready with a visible canvas. The harness then wrote both bounded log filenames into the real Emscripten filesystem and emitted one synthetic `[native-lua-error]`. Native-message instrumentation received explicit error status plus `love:lua_error`, and the immediate snapshot returned both files byte-exactly. There were 38 diagnostic events, two snapshots, zero page errors, browser dialogs, close requests, or external requests. This verifies browser bridge behavior, not the unknown real Route 2 exception or Scripting’s native filesystem.

The retained component host regressions established non-destructive patch-contract fallback. Version 3.3.0 raises that contract to revision 6: state with no patch revision or revisions 1–5 selects bundled engine SHA-256 `503542391bd1709ebdb87644ac50b51ddd49fcd70231a36668e0b3a620a2fe13` while leaving an older override file present; only revision 6 may select an integrity-valid installed override, and a digest mismatch fails closed. The validator requires the same revision in selection, installation, both patch generators, metadata, and documentation. The target Scripting host still must confirm that migration in its own Documents container.

### Deterministic executable-layer reproduction

```sh
cp runtime/gen1recomp-layer-2.1.0.love /tmp/gen1-layer-before-rebuild.love
python3 tools/build_web_love.py runtime/gen1recomp-core-0.1.78.love
cmp /tmp/gen1-layer-before-rebuild.love runtime/gen1recomp-layer-2.1.0.love
npx --yes tsx@4.20.3 tools/test_execution_layer.mjs \
  runtime/gen1recomp-core-0.1.78.love /tmp/gen1-layer-independent.love
cmp runtime/gen1recomp-layer-2.1.0.love /tmp/gen1-layer-independent.love
npx --yes esbuild@0.25.5 tools/test_execution_layer_install.ts --bundle --platform=node --format=esm \
  --alias:scripting=./tools/scripting-node-stub.ts --outfile=/tmp/test_execution_layer_install.mjs
node /tmp/test_execution_layer_install.mjs
python3 tools/test_update_boot_policy.py /path/to/verified/lua-5.1
```

The builder accepts only the manifest-pinned official core SHA-256 `4dfd6e78808024eda0cce8b9fa5434a5846d1aa327912f7a1ce3c888e416c4fe`, invokes the production TypeScript layer builder, checks output SHA-256, and rechecks the core afterward. Both revision-9 outputs were byte-identical: 312,056 bytes / 14 files / SHA-256 `d0f9fbc9af9e2d11a26ad1a3c5639205c8d32f62941d7fc3847249d69314ca71`. The internal manifest independently records SHA-256/size for all 13 non-manifest files.

`tools/test_update_boot_policy.py` extracted the committed layer-owned updater and upstream Semver, then ran them with official PUC Lua 5.1.5. `probePayload` returned the disabled policy, the pure selector retained upstream-compatible behavior, `Boot.run` removed only strictly named pending/payload paths, unrelated files remained, and stub mount/load functions were called zero times. The test first uses `getInfo` for optional pending data, matching the compatibility-PhysFS missing-read policy.

`tools/test_engine_update.mjs` remains a regression-only effective-view materializer: it proves the same guarded source transformations can cover a complete upstream view, but its output is temporary, is not catalogued, and is not packaged or executed by 3.5.0.

### Lua 5.1 source-transform adversarial matrix

The generated transformer was extracted from the committed engine and compiled/executed with an independently built official PUC Lua 5.1.5. A 23-case matrix passed. It covered byte-exact ordinary LF/CRLF sources with and without a final newline; line comments, long comments, quoted strings, and long strings containing control-flow tokens; duplicate labels; arbitrary goto; existing `break`; nested loops, `repeat`, and functions; nested `if` blocks; multiple independent loops; BOM input; LuaJIT integer suffixes; and `for`/`while` continue semantics. Unsupported or ambiguous regions were returned byte-for-byte unchanged. Recognized CRLF/BOM continue inputs were safely translated and compiled; the semantic samples returned `1,3,5`, `1,2,4,5`, and their expected multi-loop results. The exact public Kanto Life source was then rechecked: all three loops rewrote and the result passed `luac -p`. This matrix found and closed a no-op CRLF normalization edge before packaging.

### Runtime-bundle matrix

`tools/build_runtime_bundle.py` rebuilt a temporary schema-1 bundle from the committed reviewed love.js/WASM pair and retained love.js license, using the pinned 40-hex source commit. The 1,700,912-byte ZIP had the exact deterministic order `runtime-manifest.json`, `love.js`, `love.wasm`, `LICENSE.txt`; Python `ZipFile.testzip()` passed, and independent SHA-256 checks matched both manifest declarations. The temporary bundle was removed after verification.

### Installed-engine patch-contract migration regression

The device report had a specific split: 3.2.2 native installation and packing completed quickly, but newly installed local/GitHub mods were absent from Gen1Recomp’s own manager. Inspection of the preserved 3.2.1 deliverable confirmed its bundled engine’s `Loader.lua` contains neither `native-mod-packages` nor a filesystem mount call. Component state previously authenticated only the installed engine’s bytes, not which suite patch contract produced them, so a persistent hash-valid pre-3.2.2 engine could override the new bundled engine and ignore every packed archive.

The retained disposable host mock writes valid version/path/timestamps/source/installed digests plus existing engine/layer files. Version 3.4 ignored every materialized/revision-7-or-older record and required both `sourceFile` and a matching revision-8 executable layer. Version 3.5 preserves that rejection, but a valid revision-8 pair now enters a narrowly scoped transactional migration before asynchronous activation. The new regression proves the same core remains exact, revision-9 bytes/state commit on success, and injected failure restores exact revision-8 layer/state before selecting the complete bundled pair. Missing/corrupt installed pairs still fall back together, engine versions remain monotonic, and native filesystem behavior remains a target-device migration/rollback check.

### Retained 3.2.0 direct-file profile and telemetry evidence

A temporary private harness combined the production 3.2.0 HTML, CSS, loader, love.js/WASM, rebuilt `.love`, canonical Yellow fixture, and a minimal synthetic API-2 mod. Chromium 140 ran at 390×844 from `file://` with a persistent file origin; the harness and browser profile were removed immediately afterward.

Results:

- genuine Gen1Recomp reached a visible 390×844 game canvas with no page error and no HTTP/HTTPS runtime request;
- the Balanced launch printed exactly `NATIVE_PROFILE shadows=false aa=0 atmos=low water=sky viewbox=0` through the genuine mod API;
- after a native snapshot/IDBFS flush, a same-origin cached relaunch with Mod-default printed all five managed values as `nil`, proving stale Balanced values were cleared rather than retained;
- the generated profile file contained the sorted managed-key set and schema-1 payload expected by the patched loader;
- a ten-second runtime metric reached the synthetic native bridge and passed FPS, slow-frame-percentage, and worst-frame bounds;
- in-memory PNG captures from both runs exceeded 10 KiB and were discarded rather than saved.

Static checks and unit-level archive reproduction additionally cover catalog parsing, settings bounds, engine update patching, compressed ZIP reuse, runtime-bundle construction, and explicit rollback branches. Final host-mock regressions also flipped an installed Kanto package byte and observed launch-time integrity rejection, simulated a mod-library write failure and observed restoration of the prior package/library, and loaded a metadata record without the new storage field to confirm legacy expanded-file emission. These mocks do not execute Scripting’s real `FileManager` failure modes, render native `TabView`, or substitute for WKWebView/GPU/device behavior; those remain checklist items.

### Fresh 3.2.1 direct-file runtime regression

Because 3.2.1 changes native TSX/import UX rather than the bundled player bytes, the production local HTML/CSS/loader, love.js/WASM, patched `.love`, and private canonical Yellow fixture were repackaged through the same direct-injection format and opened twice from one persistent `file://` origin in headless Chromium at 390×844. No server or socket was used.

Results:

- first launch reached `[info] game loaded` in 10.56 seconds; same-origin cached relaunch did so in 3.97 seconds;
- both runs logged `loading native-injected game package` and `[info] generated data loaded (223 maps, 151 species, 165 moves)`;
- both used the expected title, a visible 390×844 canvas, successful `syncAndSnapshot()`, and a hidden fatal panel;
- in-memory screenshots were 11,586 and 10,804 bytes, confirming non-empty visible output; neither was written to the project or retained;
- browser instrumentation observed zero HTTP/HTTPS requests and zero page errors.

The generated launch directory, private browser profile, package data, and in-memory captures were removed immediately after the run.

## Genuine Gen1Recomp direct-file E2E

A private canonical Pokémon Yellow fixture was used only in temporary test directories. It was never copied into the project or deliverable.

Fixture identity:

- size: `1,048,576` bytes;
- SHA-1: `cc7d03262ebfaf2f06772c1a480c7d9d5f4a38e1`;
- SHA-256: `8cbaa499397e4f1a679c992ea9382a2dd7942ab398b48c19829c2d9529de47bf`;
- valid canonical Game Boy header.

The production HTML, CSS, direct-injection loader, love.js, patched `.love`, WASM, and generated private launch data were opened under direct `file://` URLs. Chromium used a 390×844 touch/mobile context, software WebGL, and local-file access. No HTTP server or listening socket was used.

### Startup, controls, saves, and direct injection

Previously repeated for the 3.1.1 runtime lineage and retained as regression evidence:

- `launch.js` supplied Base64 WASM and combined package bytes;
- `Module.wasmBinary` avoided a WASM fetch;
- the loader logged `loading native-injected game package` and performed no XHR;
- genuine Yellow extraction completed;
- Gen1Recomp logged `[info] generated data loaded (223 maps, 151 species, 165 moves)` and `[info] game loaded`;
- the title became `Pokemon Yellow (Gen 1 Recompilation Project) v0.1.78`;
- a 390×844 canvas rendered with genuine touch controls;
- touchscreen START opened the genuine `NEW GAME / OPTION / EXIT GAME` menu;
- `options.lua` plus a synthetic nested save restored and returned byte-identically through `Gen1RecompHost.syncAndSnapshot()`;
- a same-origin flushed second launch reused the derived cache and reached the game marker without an error.

Chromium emits expected autoplay warnings until a user gesture; these are not a WebAudio/iOS quality pass.

## Mod integration evidence

### Pure safety and profile tests

The pure tests cover the public Dramatic Shape manifest shape, safe and traversing paths, absolute-path rejection, prohibited ROM payloads, GitHub repository normalization, semantic/prerelease ordering, unsafe IDs, and unsupported future mod APIs.

Separate direct-file synthetic runs injected a minimal API-2 mod and `native_mod_state.json`:

- enabled profile: the genuine loader executed the test entry;
- disabled profile: the mod remained discoverable but the entry did not execute;
- no page/console errors occurred outside the synthetic marker intentionally emitted by the test entry.

### Stale-mod removal

A two-load test used the same file origin and IDBFS:

1. first package contained `mods/stale_test` and enabled state;
2. `syncAndSnapshot()` flushed the browser filesystem;
3. the second package contained no mods and an empty profile.

Result:

```text
loads: 2
active marker count: 1
second-load mods path exists: false
second-load state: {"schema": 1, "mods": {}}
console/page errors: 0
```

This proves that an removed native mod is not resurrected by a stale IDBFS copy in the browser harness.

### Final 3.2.4 current-engine major-mod browser matrix

After the adversarial-source fixes and final engine rebuild, fresh Chromium 140 launches requalified all four named public targets against bundled engine SHA-256 `03d43fdd9ad06bc86eccc3abb7c799ff6d6a41577c321379a119933bbbd3d8c1`. Exact release assets were digest-checked, independently root-normalized into the packed shape where necessary, injected with the private canonical Yellow fixture, and mounted through production PhysFS paths. Results at 390×844 were:

- Kanto Ascendant v6.0.11: mounted, loaded `trainer_rematch 6.0.11`, and reached `game loaded` in 14.388 seconds;
- Wilds of Kanto v1.12.2: mounted, registered all 151 sprites, loaded `overworld_wild_spawns 1.12.2`, and reached `game loaded` in 14.909 seconds;
- Dramatic Shape v1.8.2: mounted, loaded `DRAMATIC_SHAPE 1.8.2`, and reached `game loaded` in 14.072 seconds;
- Kanto Life 0.6.1: mounted, reported exactly three Lua 5.1 compatibility rewrites, loaded `kanto_life 0.6.1`, and reached `game loaded` in 13.409 seconds.

Every run exposed a 390×844 canvas and produced zero page errors and zero HTTP/HTTPS requests. These are clean-load regressions of the final engine, not full gameplay-feature coverage and not Scripting/WKWebView device evidence. The independently normalized browser packages do not replace the separately documented production-importer evidence. All public archives and ROM-bearing fixtures remained outside the project and were deleted after qualification.

### Public Wilds of Kanto v1.12.2 large-import regression

The exact public release asset remained outside the project. GitHub metadata and the downloaded bytes agreed on 13,745,457 compressed bytes and SHA-256 `7272a62c7d72f069295281835c0a6cdbaccd2bcf0c24b2b8284c90b9d68a8e3b`.

The finalized packed path passed end to end:

1. the production reader enumerated 11,955 records, normalized every path, extracted and CRC-checked all 11,921 regular files, measured 15,860,867 logical output bytes, and found exactly one root/one-wrapper package manifest;
2. the actual async `prepareModArchive()` staged `overworld_wild_spawns@1.12.2` as one 12,927,909-byte normalized package in 0.891 seconds on the disposable desktop host mock, with 212 progress callbacks and no 11,921-file native tree;
3. a fresh direct-file Chromium launch mounted `native-mod-packages/overworld_wild_spawns.zip`, loaded the exact mod, reported all 151 sprites registered with no missing source, and reached `game loaded` in 14.661 seconds with no HTTP/HTTPS request or page error.

This specifically regresses the former shared 2,048-entry/file failure, the former global-basename manifest search, and packed loader compatibility. The timing is desktop evidence, not a device prediction. The ZIP and private-ROM browser fixture remain external and are removed before delivery. The exact Stadium 2 Overworld Models v0.1.86 package was not available, so no equivalent package-specific result is claimed.

### Public Kanto Ascendant v6.0.11 failure reproduction and fix

GitHub’s exact tag metadata declared `kanto-ascendant-6.0.11.zip` as 16,662,061 bytes with SHA-256 `72779b0a9923e2e3908573552858718aa09bc6eae25222d1268bf3f1e41b62e7`; downloaded bytes matched. Python independently found 10,780 DEFLATE files, 17,743,467 extracted bytes, one root manifest, 10,601 PNGs, and a clean `ZipFile.testzip()` result. The production reader independently extracted and CRC-verified all files and parsed `trainer_rematch@6.0.11`.

The old expanded injection path reproduced the report exactly: genuine Loader logged `loaded mod trainer_rematch 6.0.11`, then compatibility PhysFS logged that `save/mod-derived/trainer_rematch/.stamp` did not exist and never returned to Lua. Even after 240 seconds no `[info] game loaded` marker appeared. This was not an entry-count failure or an ordinary slow ZIP; it was an unguarded missing optional-file read in upstream `AssetTransform.runFor` interacting with compatibility love.js.

The finalized 3.2.2 path was then exercised end to end:

- the actual async `prepareModArchive()` scanned and CRC-verified 10,780 files in 192 progress updates, preserved compressed payloads, and staged only one 16,662,061-byte normalized `package.zip`; the host-mocked desktop run took 0.750 seconds and wrote no 10,780-file native tree;
- installed metadata pins both the original release SHA-256 and normalized package SHA-256 `781387fb6b378f657f4a499fcde7380f41140cbdc85c4842bf25ec95183ac5f5`;
- `modPackageFiles()` rechecked package hash/structure and emitted exactly one mod archive plus the native state file;
- the strict direct-URL resolver accepted the exact user-supplied tag URL and selected only `kanto-ascendant-6.0.11.zip` from the repository-bound release metadata;
- genuine Gen1Recomp mounted the normalized package through PhysFS, logged `loaded mod trainer_rematch 6.0.11`, queued its transform, and reached a visible 390×844 game in 13.923 seconds with no HTTP/HTTPS request or page error;
- 302 ROM-derived images completed cooperatively by 20.321 seconds while the game was already running and the progress badge updated every 25 files;
- after explicit IDBFS sync, a same-origin cached launch reached gameplay in 3.495 seconds, mounted the mod again, and correctly skipped the already-stamped transform.

The release ZIP, normalized package, private ROM-bearing launch data, profile, and captures remain outside the project and are removed before delivery. These desktop/Chromium timings are comparative evidence, not iPhone performance claims.

### Public Kanto Life 0.6.1 parser regression

The exact user-supplied release URL resolved to `kanto-life-0_6_1.zip`, 12,952 bytes, GitHub SHA-256 `4b4eacec9fdb05822c8f1164cd1b19743d15f51c48e6df328adcc99e2d086031`, with root manifest `kanto_life@0.6.1`, API 2, and a 47,586-byte / 1,275-line `main.lua`. PUC Lua 5.1.5 reproduced the reported error exactly: line 303, `‘=’ expected near ‘continue’`. The source uses three loops with conditional `goto continue`/`goto cont` statements and a terminal label; LuaJIT supports that Lua-5.2 extension, but compatibility love.js uses PUC Lua 5.1.

The generated compatibility function recognized exactly three loops. Its output passed `luac -p` under PUC Lua 5.1.5. A behavioral sample skipped even iterations and returned `1,3,5`; a sample containing a nested loop/real `break` was deliberately returned byte-unchanged rather than rewritten. Static and dynamic engine builders produced extraction-identical 454-file payloads.

The actual async importer separately verified all three files / 48,495 logical bytes and emitted one 12,796-byte normalized package with SHA-256 `b7950313874e569b8d0234f81f0e297461a0c42e3ebee7574f6abee9ee91380d`. A fresh 390×844 direct-file Chromium launch then used the production love.js/WASM, rebuilt `.love`, canonical private Yellow fixture, and that normalized package. Genuine Gen1Recomp logged:

```text
mounted native mod archive kanto_life.zip
applied Lua 5.1 continue compatibility: mods/kanto_life/main.lua (3 loops)
loaded mod kanto_life 0.6.1
game loaded
```

Gameplay loaded in 15.733 seconds with no page error and no HTTP/HTTPS request. This proves parsing/loading in the browser harness, not behavior of every Kanto Life feature or Scripting/WKWebView on the target device. The public ZIP and all private-ROM browser material are removed before delivery.

### Public Dramatic Shape v1.8.2

The 8,380,403-byte public archive was rechecked through the finalized packed pipeline. The importer enumerated 310 records, CRC-verified all 257 regular files / 19,698,060 logical bytes, parsed `DRAMATIC_SHAPE@1.8.2`, and staged one 8,357,945-byte package in 0.397 seconds / 7 callbacks on the disposable desktop host mock. Runtime emission rechecked it and produced one packed archive plus native state. Earlier genuine Gen1Recomp browser evidence remains valid for visible voxel gameplay; the new packed form still requires the real-device rendering check. The fixture is deleted before delivery.


The example repository supplied by the user was downloaded only to a temporary test location. GitHub’s release metadata and the downloaded archive agreed on:

- asset: `DRAMATIC_SHAPE-1.8.2.zip`;
- compressed size: 8,380,403 bytes;
- extracted payload: 19,698,060 bytes across 257 files;
- SHA-256: `31a6a4e810610d540b830d411b6c47272407e9254b2969171aca780fcbe874f2`;
- manifest: ID `DRAMATIC_SHAPE`, API 2, entry `main.lua`, permission `engine_internals`, engine range including v0.1.78.

The unmodified public mod was packaged through the production virtual paths with genuine Gen1Recomp and the private Yellow fixture. It logged:

```text
[info] loaded mod DRAMATIC_SHAPE 1.8.2
[info] game loaded
[info] map: REDS_HOUSE_2F at (3,6)
```

Touchscreen automation reached free roam and tapped the genuine on-screen **SELECT** control, which the mod documents as its mobile voxel-view cycle. After the final compatibility patch, the resulting 390×844 private screenshot was visually inspected: the bedroom rendered as a lit, perspective voxel diorama with the player, furniture, walls, floor, shadows, and native touch controls visible. It was not a black frame. The final unmodified-mod run produced no console/page error; only Chromium autoplay warnings and a software-WebGL `ReadPixels` performance warning appeared. The screenshot was deleted immediately after inspection.

Targeted temporary instrumentation had traced the prior software-rendered black frame to love.js entering an unsupported *readable* depth-canvas binding and not returning to Lua. The production Web-only preflight now asks `love.graphics.getCanvasFormats(true)` and raises a normal Lua error for a reported-unsupported readable depth format, allowing the unmodified mod’s own internal-depth fallback to run. No third-party mod source is modified or redistributed.

The optional Pokémon Stadium model feature was not tested and no Stadium ROM was supplied. Ordinary voxel rendering and the mod’s Game Boy-art 2D-3D paths do not require that separate cartridge.

## Deterministic source/package construction

The v3.5.0 source manifest covers exactly 78 distributable files, excluding only `MANIFEST.sha256` itself from its own hash list. Packaging uses lexicographic paths, no directory records, fixed DOS timestamp `2026-08-13 08:00:00`, raw file bytes, DEFLATE level 9, Unix regular-file modes (`0644`, with the eleven shebang Python tools marked `0755`), no extra fields, no archive comment, and no ZIP64. A second clean builder independently enumerates the source tree rather than reading the manifest; its output must be byte-identical before delivery. Package identity and audit results are reported outside this self-contained archive to avoid an impossible self-referential hash.

## Privacy, payload, license, and network audit

- The project contains no `.gb`, `.gbc`, `.rom`, `.sav`, `.state`, `.ipa`, Stadium ROM, or third-party mod file.
- The patched `.love` contains no ROM, save, or mod payload.
- No generated `runtime/launch.js` is bundled.
- Temporary direct-file fixtures, saves, logs, screenshots, downloaded mod archives, browser profiles, and instrumented mod copies remain outside the project and are deleted before delivery.
- Persistent console journals are local and never uploaded automatically. Suite-generated context does not read or serialize ROM bytes, save contents, original ROM filenames, ROM hashes, covers, screenshots, or browser profiles. Exact engine-generated `lua-error.log` / `.1` are now mirrored as save-side diagnostics, but their contents are not inserted into suite context independently; the same originating traceback enters the journal through `[native-lua-error]`. Complete engine/mod console text may contain technical paths or gameplay state, so the user is warned to inspect it before explicit sharing. Temporary TXT/JSON/JSONL/CSV export copies are removed after the share menu returns.
- Package caching is disabled so the injected ROM/mod package is not duplicated into Emscripten package IndexedDB.
- The generated ROM/mod-bearing launch directory is removed by native `finally` cleanup.
- Runtime package loading has no executable external URL, fetch, XHR, listening socket, or server API.
- Native GitHub release/mod operations are explicit. Mod release URLs are repository-bound and downloads require a published SHA-256 digest. Persistent manager metadata contains trusted asset URL/title/size/hash/status only; `.part` files are never injected, prepared, shared, or installed until exact size and hash pass.
- Dramatic Shape is not bundled because its repository restricts redistribution of later code; the suite offers only direct, confirmed installation from the selected external release.

## Not verified without a device

The following claims remain open until `DEVICE_TEST_CHECKLIST.md` is completed on the target iPhone/iPad and current free-tier Scripting build:

- 3.5.0 import plus retained in-content Mod settings Back/Close and the complete free-tier Thread/async-FileManager path (3.3.0 remains user-confirmed rollback);
- exact installed Scripting declaration compatibility for `Response.dataStream`, `FileManager.appendDataSync`, `AbortController`, and determinate `ProgressView` beyond current official documentation/host shims;
- performance/memory of the local TypeScript ZIP/DEFLATE implementation on the target iPhone/iPad;
- confirmation that mod import and save-ZIP export show no PRO prompt in the installed free Scripting build;
- document-provider mod/ROM import and export;
- native transactional mod install/update/remove filesystem behavior;
- real poor-connection GitHub engine/mod/IPA download progress, retry/backoff, HTTP Range/If-Range resume, ignored-Range restart, pause/process-reopen/resume/cancel, exact size/SHA-256, and transactional handoff on the target free-tier host;
- native full-screen presentation, four consistent leading close actions, four-tab rendering, tab badges, German/Dynamic Type layout, Settings persistence, and startup scheduling;
- Settings JSON/JSONL/CSV options-menu export, temporary export-file cleanup, confirmed clear, journal rotation, and crash-tail behavior on iOS (the supplied real-device TXT proves persistent capture and one complete TXT export, but not these remaining variants);
- native responsiveness, peak memory, cancellation, and low-storage behavior while cooperatively verifying/repacking 10,000+ file mods such as Wilds of Kanto v1.12.2 and Kanto Ascendant v6.0.11;
- PhysFS mounting of integrity-pinned packages, first-run background-art progress, frame pacing while one image is generated per frame, completed-stamp persistence, and legacy expanded-mod fallback in Scripting’s WKWebView;
- the exact Stadium 2 Overworld Models v0.1.86 archive, if obtained from its legitimate source;
- revision-6 engine Update Center check/managed-download/patch/install/reset and rollback under injected write failures;
- runtime-bundle import of a trusted compatibility pair, rejection cases, coupled rollback, and reset;
- 10/15/30/60-second save timing, unchanged periodic inventory suppression, complete final snapshots after `syncfs`, bounded performance metric delivery, and profile application on the next launch;
- revision-8-to-9 migration against a genuine retained 3.4.0 installed core/layer pair, including injected failure rollback and complete bundled-pair fallback;
- enabled-only launch payload reduction and next-launch re-enablement with large real installed mods;
- same-route 15-minute walking and ten-battle comparison on iPhone 16 Pro Max / iOS 26.6, including battle-start time, FPS/slow/worst-frame series, Wasm/Lua/graphics fields, thermal state, and absence of the former continuous PotatoVoxel retry loops;
- real WKWebView diagnostic envelope/native append reduction plus terminal/export durability under the new batching policy;
- native ↔ genuine in-game manager state round-trip through the Scripting message handler;
- exact target-device capture/edit/reset/write-back of all 12 PotatoVoxel 1.4.4 rows, especially SHADOWS OFF/`false`, plus exhaustive other literal/dynamic toggle/choice/number/text paths, validation errors, profile precedence, reconciliation, recovery, and accessibility/layout (headless exact Potato capture passes; the user has confirmed only the earlier 3.2.8 editor generally);
- the retained 3.2.7 first-error guard and Lua-error-log mirror with the same Route 2 save and mod combination in Scripting’s WKWebView (the supplied 3.2.6 trace already confirms the Wilds `rgba4` guard and exposes the diagnostics defect, but cannot contain the originating traceback);
- retained gameplay remaining live after PotatoVoxel’s caught generic alert, while real `WebViewController.dismiss()` still returns after in-game EXIT, Emscripten exit/abort, uncaught browser/promise failure, and before-ready fatal-panel close;
- file-origin IDBFS/IndexedDB cache persistence on iOS;
- native snapshot delivery/file writing and restoration across app/device restart;
- temporary launch-file deletion under startup failure and iOS suspension (the supplied after-alert and normal user-close sessions record successful temporary-runtime deletion);
- target WebKit process peak memory and jetsam behavior during bounded chunk decode plus the unavoidable Emscripten package-to-heap copy, especially with large/multiple mods;
- iOS GPU/depth behavior and performance for Dramatic Shape and other visual mods;
- iOS WebAudio after touch activation;
- rotation, safe areas, Dynamic Type, VoiceOver, and Reduce Motion.

Static, host-shim, Lua/ZIP, and desktop-browser evidence must not be described as a 3.5.0 free-tier iOS host pass. Both PRO-only server/archive designs remain removed, and 3.3.0 is user-confirmed rollback. Revision-9 layer-first boot, genuine revision-8 migration, exact PotatoVoxel runtime behavior, same-route frame/memory results, enabled-only launch bytes, diagnostic/save bridge reductions, background worker transfer/cost, async filesystem behavior, separate core mount/save-shadow resistance, installed-pair fallback/rollback, chunked startup/peak memory, forced-termination recovery, low-memory callback, all Potato rows, caught-alert continuity, download UI/network behavior, and retained Back/Close still require named target-device qualification.
