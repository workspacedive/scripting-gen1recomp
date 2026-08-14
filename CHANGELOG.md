# Changelog

## 3.5.0 — 2026-08-13

### Evidence-driven PotatoVoxel performance stabilization

- Analyzed the supplied complete 3.4.0 iPhone 16 Pro Max / iOS 26.6 TXT export: 479,871 bytes, 6,809 lines, 2,262 events, 549 repeated actor-decal aborts, 262 identical invalid vertex-map failures, FPS declining from 45.18 to 3.79, Wasm growth from 256 to 856 MiB, and Lua telemetry reaching 555,156.7 KiB. Stable texture memory rules out a texture-only explanation; the exact source of all retained Lua memory remains unclaimed.
- Raised the execution-layer patch contract from revision 8 to 9 and the separately updateable layer from 2.0.0 to 2.1.0. The unchanged official v0.1.78 core remains SHA-256 `4dfd6e78808024eda0cce8b9fa5434a5846d1aa327912f7a1ce3c888e416c4fe`.
- Added exact-mod-ID, exact-path, unique-source PotatoVoxel v1.4.4 rewrites. `SpriteBillboards.buildShadowBlob` now emits a one-based Lua-table vertex map; Data-form maps and `Voxel3D.pushQuad` remain untouched.
- Added broken-session retirement and first-failure `xpcall` traceback retention to the exact `OverworldBattle.lua` source. A failed arena is no longer rendered on every later update.
- Added one-failure actor-decal quarantine to the exact `VoxelScene.lua` source. The first detailed failure is retained, the ordinary lit scene remains, and the failed pass is not rebuilt/retried every frame.
- Kept all installed publisher archives byte-identical. Same-source alternate paths are not transformed, and unsupported/mismatched source revisions fail closed through the existing attributed mod path.

### Lower launch, bridge, and periodic-save work

- Changed runtime packaging to include payload bytes only for enabled mods. `native_mod_state.json` still mirrors the complete installed library, so disabled mods remain manageable and reappear on the next launch after native re-enablement without reinstallation.
- Replaced one native file append per diagnostic record with ordered asynchronous batches of approximately 64 KiB or 75 ms. A failed async append receives one whole-batch synchronous fallback; exports, clear, session end, and terminal cleanup flush pending evidence.
- Changed the browser bridge to ordered envelopes of at most 48 entries or 40 ms behind one Promise chain, with fatal records forcing handoff. Native accepts at most 128 validated entries per envelope.
- Added stable sorted path/size/mtime save inventories. Unchanged periodic passes skip save reads, Base64 allocation, and bridge traffic; final post-`syncfs` snapshots still collect every allowed file.
- Preserved detailed unsampled local diagnostics, complete TXT/JSON/JSONL/CSV exports, terminal evidence, save limits, and privacy boundaries.

### Transactional installed-layer migration

- Added a narrow revision-8-to-9 migration before asynchronous activation. A valid installed core is reverified and retained byte-for-byte while a new revision-9 source layer is generated locally.
- Added layer/state staging, exact prior-state capture, backup, commit, post-commit activation verification, and rollback. Success reports `upgraded`; failure restores old bytes/state and selects the complete bundled pair as `failed-bundled-fallback`.
- Continued to ignore materialized/revision-7-or-older component state non-destructively. Corrupt or incomplete pairs never partially activate.

### Artifacts and verification

- Added deterministic `runtime/gen1recomp-layer-2.1.0.love`: 312,056 bytes, 14 files, SHA-256 `d0f9fbc9af9e2d11a26ad1a3c5639205c8d32f62941d7fc3847249d69314ca71`.
- Added exact official PotatoVoxel v1.4.4 archive/path/source/PUC-Lua regressions; enabled-only payload/state/re-enablement regressions; ordered diagnostic batch/fallback/export regressions; periodic-save/bridge static guards; and revision-8 migration success/rollback/fallback regressions.
- Updated TypeScript validation, compatibility-pack boundary checks, project validator, architecture, README, validation record, and device checklist. Automated tests distinguish source/host-shim evidence from still-required iPhone frame-time, battle-start, walking, memory, migration, and bridge/save measurements.

## 3.4.0 — 2026-08-13

### Bounded worker-backed mod preparation

- Replaced main-thread ZIP scanning/CRC/DEFLATE/repack work with documented free-tier `Thread.runInBackground` stages: 256 scan entries, at most 16 verification entries / 8 MiB declared output per ordinary batch, and one off-main archive-backed repack.
- Added `createRepackedZipFromArchive`, which copies verified compressed ranges directly into the normalized output instead of retaining one sliced compressed `Uint8Array` per entry.
- Switched source/package/temp reads and writes to asynchronous `FileManager` methods, including runtime package enumeration and mirrored-save reads. UI progress is delivered only after each worker result returns to the initiating thread.
- Retained exact path, collision, symlink, encryption, overlap, CRC, ratio, file/entry/byte, payload, manifest, API, and transactional install gates. No Scripting `Archive`, host zip/unzip, server, or pthread path was added.

### Bounded local binary transport and launch recovery

- Replaced generated whole-payload `wasmBase64`, `packageBase64`, and `Data.combine(parts)` with metadata-only `launch.js` plus ordered local scripts capped at 1 MiB decoded bytes.
- Added `runtime/binary-transport.js`: strict local names, preallocated exact-size arrays, kind/index/offset/length validation, direct decode-to-destination, self-removing script nodes, one-shot `take`, and a legacy read-only fallback in consumers.
- Added asynchronous component/ROM/save/mod reads and serial asynchronous chunk writes. The old Emscripten package-to-heap copy remains, so this is a bounded peak-memory reduction rather than a zero-copy claim.
- Added atomic `runtime-recovery.tmp.json` → `runtime-recovery.json` ownership. The next launch removes an interrupted private runtime before rebuilding; clean close asynchronously deletes chunks/ROM data and clears its matching marker.

### Chrome-inspired executable layer, immutable core, and telemetry

- Replaced the revision-7 reconstructed Web materialization with a genuine, separately versioned execution layer. The exact official 4,418,896-byte v0.1.78 core remains unchanged at SHA-256 `4dfd6e78808024eda0cce8b9fa5434a5846d1aa327912f7a1ce3c888e416c4fe`; it is transported and mounted separately and is never `/game.love`.
- Added the deterministic 306,051-byte / 14-file layer v2.0.0 at SHA-256 `9747747700041467aab4a19a529bdb07d07744596d336b70e2496a370836d62e`. It contains boot brokers, only the declared compatibility/guard/bridge/policy/telemetry modules, and no ROM/save/core payload.
- Promoted `config/compatibility-pack.json` to schema 2 / revision 8. It pins layer/core digests and compatibility, source-before-core-before-save precedence, monotonic engine policy, transactional install, bundled rollback, required capabilities, and exact effective targets.
- Layer `conf.lua` reads `/gen1recomp-core.love`, checks exact size and SHA-256 again through LÖVE 11.5 `love.data`, mounts a `FileData` appended behind the source layer, and forces writable identity storage behind executable sources. Layer `main.lua` rejects critical modules resolved from the save directory before entering the compatibility-wrapped core main.
- New engine installs retain downloaded upstream bytes as `gen1recomp-core-active.love` beside `gen1recomp-layer-active.love`. Both stage/back up/rollback together; revision 7 and older materialized state cannot activate. Missing/corrupt installed pairs fall back as a unit to the bundled verified pair.
- Added a genuinely independent **Import execution-layer update** component path. A newer source-only layer can activate around the exact current core without replacing/rebuilding it. Revision/suite/core version/core bytes/core SHA-256, safe complete targets, deterministic marker, every file size/SHA-256, archive hash, monotonic version, transactional rollback, and post-install re-verification are enforced; Settings can restore the generated/bundled layer independently.
- Made `src/update/Boot.lua` layer-owned. The upstream writable payload probe/prepend-mount/`loadstring`/chainload path cannot run around the active layer; only bounded stale pending/payload cleanup remains, while host engine/layer updates retain native verification and transactions.
- Added browser/Wasm capability probes, Wasm/optional JS heap measurements, and Web-only ten-second Lua/LÖVE graphics telemetry using a reused stats table. `love.lowmemory` performs one emergency full collection and reports post-collection Lua KiB; no speculative normal-frame GC tuning or VM migration was enabled.
- Retained stable LÖVE 11.5/PUC Lua 5.1. Lua 5.5.1 and unreleased LÖVE 12 remain researched future migrations, not unsafe drop-in replacements.

### Verification additions

- Added exact binary-transport ordering/completion/reuse/local-name tests, worker-stage/progress/async-output package-byte tests, recovery ownership/interruption/malformed-journal tests, immutable-core/effective-target separation, and deterministic execution-layer generation tests.
- Fresh Chromium 140 proved actual layer-first boot into the separately mounted immutable core at 390×844 with no page error/network request. Independent runs proved corrupt-core `core-digest` rejection, absent-core `core-absent` rejection, non-execution of a malicious save-directory `src/mods/Loader.lua`, and non-execution/removal of a malicious writable updater `Boot.lua` plus pending executable archive. PUC Lua 5.1 verified updater selector/cleanup behavior; the native host mock verified independent layer install, wrong-core/downgrade rejection, injected-rename rollback, corruption fallback, and reset. These are automated/browser results, not target WKWebView evidence.
- The Python build front end now invokes the same TypeScript layer builder used by component installs and emits no patched-core archive. Static/type/archive/browser tests distinguish automated evidence from the still-required free-tier iPhone/WKWebView worker, layer boot, memory, lifecycle, and performance matrix.

## 3.3.0 — 2026-08-13

- Fixed the genuine target-device gameplay exit from the supplied 3.2.9 console export. PotatoVoxel’s `Invalid vertex map value: 0` originates inside a Lua `pcall`; its later `actor decal pass aborted` records prove execution continued. Davidobot’s generic post-ready Emscripten alert is now retained as a warning without dismissal. Independent Emscripten abort/exit, uncaught window error, unhandled rejection, explicit close, and fatal-panel paths still return to the dashboard. Native `closePlayer` also defensively ignores only the ambiguous legacy alert reason.
- Added `modules/downloads.ts`, a shared persistent download queue for verified engine, GitHub-mod, and IPA assets. It streams Scripting `Response.dataStream` chunks to `.part` files with `appendDataSync`, persists state through fixed `downloads.tmp.json`/`downloads.backup.json` transactions with corrupt/missing-primary recovery, retries transient failures up to six attempts with bounded backoff/`Retry-After`, and exposes pause/cancel/resume.
- Added strict HTTP resume invariants: send Range from the exact reconciled file size, bind with `If-Range` when a validator exists, append only matching `206 Content-Range`, and discard/restart before accepting `200`. Exact expected size and published SHA-256 remain mandatory before any installer receives bytes.
- Added determinate, localized Download Manager cards to Mods and Settings with byte totals, speed, attempt/state, HTTP-resume status, progress bars, and controls. Interrupted records become paused on the next process and can resume; no unsupported background-after-termination promise is made.
- Reproduced PotatoVoxel v1.4.4 against exact Gen1Recomp v0.1.80 under LuaJIT and isolated its zero-row cause: the SHADOWS choice’s valid `false` tuple value was collapsed to nil by an `and/or` expression. Dynamic normalization now preserves false for RFC-0008 `[label, value]` and common object choices, accepts bounded `maxLen`/`maxLength`, and skips malformed rows without erasing valid siblings. Exact reproduction captures all 12 Web-compatible PotatoVoxel rows.
- Raised the installed-engine patch contract to revision 6 and deterministically rebuilt bundled v0.1.78 with the same dynamic schema fix. Preserved the Kanto Life Lua 5.1 pass, packed mods, Wilds guard, first-error diagnostics, update rollback, and visible in-content Mod-settings Back/Close controls.
- Added regressions for exact caught-alert policy; PotatoVoxel boolean/object choices and malformed siblings; connection-loss Range resume; ignored-Range restart; malformed/mismatched `206`; progress; pause/resume; active and queued cancel; cancelled-ID reuse; discard; size/hash failure; process-reload/backup recovery; interrupted queue-commit rollback; TypeScript compilation; and dynamic patching of official Gen1Recomp v0.1.80.

## 3.2.9 — 2026-08-13

### Mod-settings navigation hotfix

- Incorporated the target-device 3.2.8 result: the release imports and runs and the native Mod settings editor works, but the installed Scripting build did not visibly refresh the conditional leading toolbar item when the Mods tab changed from its list into the editor.
- Replaced the conditional toolbar-node swap with one stable leading `Button` whose title, icon, and action change between root Close and editor Back states.
- Added a prominent in-content **Back** button before the editor title plus a separate in-content **Close** button. These actions do not depend on toolbar refresh and return to the installed Mods list or dismiss the suite directly.
- Kept the editor inside the existing scroll/safe-area layout and retained the toolbar fallback. No mod value, schema, reset, profile, save, engine, runtime, network, permission, ROM, or installed-mod behavior changed.
- Added static validation for both independent escape actions and updated the target-device checklist. The new 3.2.9 controls still require one tap-level confirmation on the user’s Scripting build.

## 3.2.8 — 2026-08-13

### Native per-mod settings and genuine-default reset

- Added a polished settings surface under **Mods → installed mod → Mod settings**. It renders every bounded Gen1Recomp option-schema row as a native toggle, choice, number, or text control, preserves mod-authored labels/descriptions/choice values, shows the declaration source, and applies native changes on the next game launch.
- Added **Restore genuine defaults** per mod. Reset removes explicit overrides for every captured row and suppresses suite performance-preset values for that mod, so the next launch really falls through to the defaults declared by the installed mod version. Explicitly choosing a performance profile later re-enables that profile’s catalog-managed keys; unrelated settings remain untouched.
- Kept profile behavior coherent: a selected Balanced/Efficient profile seeds only unspecified catalog-managed settings; explicit native or in-game values take precedence. Choosing another profile clears explicit values only for that profile’s managed keys. The Quality profile therefore returns those keys to the mod defaults without erasing unrelated mod preferences.
- Implemented two safe discovery paths. A manifest `options_schema` is accepted immediately only when a new bounded parser proves the file is exactly `return <literal table>`; local declarations, calls, functions, expressions, duplicate/reserved keys, excessive nesting/rows/choices/text, non-finite numbers, and trailing executable code are rejected without execution. Dynamic schemas are captured only after the installed mod runs inside genuine Gen1Recomp’s existing Lua/LÖVE sandbox. The native dashboard never executes installed Lua to discover settings.
- Patched the genuine loader to normalize at most 128 rows and 128 choices per row into primitive JSON after successful mod loading, including its own lazy `options_schema` path. It marks the exact mod version probed, retains schemas for disabled/legacy installs once discovered, and re-captures dynamic/conditional choices after mod updates and later launches.
- Added a 512 KiB `native_mod_options.json` mirror with strict native validation, staged rename/rollback, prior-state backup recovery, per-key known-state tracking, and profile-before-explicit precedence. Existing `options.lua` values migrate once after the genuine schema is known; later writes through Gen1Recomp’s verified `SaveData.saveOptions` path update the same mirror, covering START → MODS edits and custom menus that persist through the normal engine API. Uninstall clears stale schema/probe/reset metadata while preserving upstream-compatible primitive values and known keys for a safe reinstall.
- Added the option mirror to periodic/final transactional snapshots and retained the v3.2.7 `lua-error.log`/`.1` allowlist plus immediate `[native-lua-error]` snapshot. No ROM/save content, arbitrary filesystem path, new permission, runtime network path, Scripting PRO API, or host archive API was added.
- Audited exact public declarations: Wilds of Kanto 1.12.2 exposes 18 literal rows; Kanto Life 0.6.1 exposes 10 dynamic rows; Kanto Ascendant 6.0.11 exposes 45 dynamic rows; Dramatic Shape 1.8.2 builds 14 rows from its live supported setting ladders. Wilds’ exact literal schema parsed without execution; the other three use the genuine-runtime capture path rather than unsafe source evaluation or hardcoded per-mod UI.
- Raised the installed-engine patch contract to revision 5. Revision 1–4 overrides fall back non-destructively to the bundled option-bridge-compatible engine.
- Added TypeScript regressions for literal parsing, executable-Lua rejection, all four row types, profile/explicit/default precedence, and range validation; a PUC Lua 5.1 harness for schema normalization, false/number legacy migration, and post-save in-game mirroring; exact Wilds 1.12.2 `rgba4`/`rgba8` tests; extraction parity between static/dynamic engine builders; and strict project validation. Real Scripting/WKWebView interaction and the still-unknown Route 2 exception remain device checks.

## 3.2.7 — 2026-08-12

### First-failure Lua diagnostics hotfix

- Analyzed the user’s complete 312,465-byte / 3,962-line real-device 3.2.6 TXT export from iPhone/iOS 18.7. It proves the Wilds `rgba4` hotfix itself works: the engine printed the exact `[native-compat] guarded unsupported ImageData PNG encode` marker, Wilds prepared 1,298 runtime sheets and registered all 151 sprites, the Route 2 save loaded, two Wilds battles completed, and no `rgba4` encoder error occurred.
- Isolated the later alert at Web elapsed `+94708 ms` as a separate diagnostics failure, not a window-initialization or Wilds-bake recurrence. An originating but unrecorded Lua exception entered Gen1Recomp’s `love.errorhandler`; bundled `src/debug/SwitchDiagnostics.lua` then unconditionally read the optional, not-yet-created `lua-error.log` and raised `Could not open file lua-error.log. Does not exist.` before it could persist the original exception.
- Recovered Davidobot’s exact LÖVE Emscripten source and history. Commit `f64636ac516eed78aeccef94575e7a285faaa296` changed `src/common/Exception.cpp` so every `love::Exception` constructor prints and calls a generic browser alert under `LOVE_EMSCRIPTEN`, including an exception that Lua/API logic may otherwise handle. This explains why the secondary missing-file exception produced the misleading “before the game window could be initialised” message after more than 92 seconds of genuine gameplay.
- Added a narrow `getInfo(ERROR_LOG, "file")` probe before the optional error-log read. Existing logs still append and rotate normally; a first failure now writes directly without constructing the missing-file exception.
- Made the engine print a `[native-lua-error]` traceback before any error-log filesystem work. The local shell recognizes that marker as an explicit runtime error, preserves it in the existing complete Settings exports, and schedules an immediate native snapshot without forcing an automatic close.
- Added `lua-error.log` and `lua-error.log.1` to the exact native save allowlist so the upstream error history survives player dismissal/relaunch. Existing path, per-file, aggregate, staging, and transaction limits still apply; no arbitrary log path or save subtree was admitted.
- Raised the installed-engine patch contract to revision 4. Overrides created with revisions 1–3 fall back non-destructively to the bundled diagnostics-compatible engine; ROMs, saves, settings, mods, and the old component file remain untouched.
- Added a reproducible PUC Lua 5.1 regression covering an absent first log, normal append, 32 KiB rotation, and binary-looking error redaction. Static and dynamic builders produce extraction-identical 454-file engines, and the exact Wilds `rgba4`/`rgba8` regression still passes.
- Fresh Chromium 140 loaded genuine canonical Yellow at 390×844, reached ready, then a synthetic `[native-lua-error]` produced an explicit native error status and mirrored both error-log generations with no page error, dialog, close request, or external request. This is browser evidence only. The originating Route 2 Lua error remains intentionally unguessed and requires one 3.2.7 target-iPhone run plus a new TXT export.

## 3.2.6 — 2026-08-12

### Wilds of Kanto rgba4 hotfix

- Analyzed the user’s complete 893,371-byte / 11,247-line real-device 3.2.5 TXT export. Two launches with `overworld_wild_spawns@1.12.2` active reached genuine `game loaded`/native ready, then each produced `No suitable image encoder for rgba4 format`, the generic love.js alert, and attributed `map.entered` plus `save.loaded` nil-call errors from `lib/spawn_render.lua`. A third launch with Wilds inactive—but still installed and mounted—loaded the same game and remaining mods, saved, closed, and ended without a runtime error.
- Rechecked the exact public Wilds v1.12.2 source and release SHA-256 `7272a62c7d72f069295281835c0a6cdbaccd2bcf0c24b2b8284c90b9d68a8e3b`. Its optional `bakeSheet` reads a default Canvas into ImageData and unconditionally enters PNG encoding. Official LÖVE 11.5 source confirms that PNG encoding accepts `rgba8` and `rgba16`, not the valid WebGL/iOS `rgba4` readback observed on-device.
- Added an exact compile-boundary capability guard for `@mods/overworld_wild_spawns/lib/spawn_render.lua`. On unsupported ImageData formats it returns through Wilds’ existing documented `nil` bake fallback before entering the incompatible native encoder; supported `rgba8`/`rgba16` behavior is unchanged.
- Wrapped standard-Lua `loadstring` as well as `load`, because Wilds loads its own library modules from `mod:read` through `loadstring` and therefore correctly bypassed the older entry-only source path. The installed/public mod archive and publisher source remain byte-identical; the narrow compatibility change exists only in the source string compiled by the Web runtime.
- Raised the installed-engine patch contract to revision 3. A valid engine preserved from 3.2.5 cannot silently override the new bundled guard; it falls back locally without deleting the older component, games, saves, mods, or settings.
- Exact PUC Lua 5.1.5 tests compiled the 91,263-byte v1.12.2 module, applied exactly one idempotent path-scoped guard, left a same-source unrelated path unchanged, skipped the encoder for `rgba4`, and preserved the normal `rgba8` encode/write path.
- A Chromium 140 forced-`rgba4` baseline with the 3.2.5 engine reproduced the generic alert and `No suitable image encoder for rgba4 format`. The rebuilt engine mounted and loaded exact Wilds 1.12.2, forced the same 16×16 bake Canvas to `rgba4`, took the legitimate battle-front/runtime-sheet fallback, reached genuine gameplay at 390×844, and produced zero alerts, Wilds errors, close requests, page errors, dialogs, or network requests. This is browser evidence; the target iPhone must still confirm the fix under WKWebView.

## 3.2.5 — 2026-08-12

### Persistent complete console diagnostics

- Responded to the real-device report that gameplay starts but a generic love.js alert—“An error occurred before the game window could be initialised. Please check the console!”—provides no usable console in Scripting.
- Added an append-only native/Web diagnostic journal that survives player dismissal and dashboard relaunch. Capture starts before `launch.js`, `game.js`, and love.js and includes all wrapped browser console methods, `window.error`, unhandled promise rejections, browser alerts, Emscripten abort/exit, WebGL creation/loss/restoration, package metadata/decoding/file injection, LÖVE output, runtime status, native launch stages, component verification, request decisions, save synchronization, cleanup, and full native error stacks.
- Removed the former 400-character runtime-message truncation. Web messages are not sampled or shortened; strings over 12,000 characters are preserved as ordered chunks. Rotation happens only before a new session when the active journal reaches 8 MiB, so the complete failing session plus the previous journal remain exportable. A smaller unterminated crash tail is retained as an explicit malformed record and separated by a newline before new JSONL is appended.
- Added a dedicated **Settings → Console diagnostics** surface with event/session/error/byte counts, a bounded latest-error preview, confirmed clearing, and complete `.txt`, `.json`, `.jsonl`, and `.csv` exports through `DocumentInteraction.optionsMenu`. Temporary export copies are deleted after the system menu returns.
- Suite-generated context still excludes ROM bytes, save contents, original ROM filenames/hashes, and cover data. The UI now warns that unmodified engine or third-party mod console text can itself contain technical paths or gameplay state and should be inspected before sharing.

### Player exit and fatal recovery

- Replaced Emscripten’s blocking generic browser alert with a persistent trace and in-player fatal panel. The panel has a direct **Close player** action and tells the user where to export the trace.
- `Module.onExit`, `Module.onAbort`, and alerts raised after `game loaded` now request and await documented native `WebViewController.dismiss()`. Duplicate requests are coalesced while dismissal is in flight, and a rejected dismissal can be retried, returning to the existing dashboard before normal final-sync/dispose/temporary-payload cleanup.
- Fresh Chromium loaded genuine Gen1Recomp to a 390×844 canvas in 12.665 seconds with zero page errors, dialogs, or network requests while producing 40 diagnostic entries. A synthetic 25,001-character console error was recovered completely from three chunks; alert-after-ready and runtime-exit both emitted close requests. A separate before-ready alert displayed the fatal panel, retained alert/fatal traces, and its close button emitted the expected native close request without a browser dialog. A third regression forced the first dismissal request to reject, retained a visible fatal panel plus `close_rejected` trace, and accepted a second button request without a page error. A fourth deliberately mismatched native package size and retained `base64_decode_failed`, `package_error`, the complete stack, and a visible fatal panel without a browser dialog or page error.
- A disposable host test verified persistent JSONL writing, full error stacks/chunks, summaries, all four exports, and confirmed clearing. The bundled patched engine is unchanged from 3.2.4; the new behavior is in the local host/runtime shell.

## 3.2.4 — 2026-08-12

### Kanto Life 0.6.1 on standard Lua 5.1

- Reproduced the reported parser failure with the exact public `kanto-life-0_6_1.zip`: release size 12,952 bytes, SHA-256 `4b4eacec9fdb05822c8f1164cd1b19743d15f51c48e6df328adcc99e2d086031`, manifest `kanto_life@0.6.1`.
- Confirmed its 1,275-line `main.lua` uses three LuaJIT/Lua-5.2-style terminal-label loops. PUC Lua 5.1 fails exactly at line 303 on `goto continue`, matching the device report; love.js uses PUC Lua 5.1 rather than desktop LÖVE’s LuaJIT.
- Added a deliberately narrow compile-time compatibility pass. It rewrites only one-line conditional gotos aimed at a terminal label immediately before the containing `for`/`while` loop’s end, and only when the region has no nested loop, `repeat`, function, or real `break`. The equivalent Lua-5.1 `repeat … until true` block preserves continue behavior.
- Arbitrary goto control flow is not guessed or accepted. Unsafe/unrecognized regions remain unchanged and fail through the normal attributed mod error path. No-op transforms preserve ordinary source bytes exactly, including CRLF and final-newline state.
- Mod archives and installed source remain byte-for-byte unchanged; compatibility is applied only to the in-memory source submitted to the Web Lua parser.
- The actual importer emitted one 12,796-byte normalized package (SHA-256 `b7950313874e569b8d0234f81f0e297461a0c42e3ebee7574f6abee9ee91380d`); fresh Chromium mounted it, reported three compatible loops, loaded `kanto_life 0.6.1`, and reached `game loaded` in 15.733 seconds with no page error or HTTP/HTTPS request.
- Passed a 23-case official PUC Lua 5.1.5 adversarial matrix spanning comments/strings, duplicate labels, nested blocks/functions/loops, arbitrary goto, existing break, CRLF, BOM, no-final-newline input, unchanged ordinary mods, and continue semantics. Final-engine Chromium reruns also clean-loaded Kanto Ascendant v6.0.11, Wilds of Kanto v1.12.2, Dramatic Shape v1.8.2, and Kanto Life 0.6.1 with no page error or network request.
- Raised the installed-engine patch revision so a preserved 3.2.3 engine cannot override this compatibility build.

## 3.2.3 — 2026-08-12

### Packed mods missing after an in-place upgrade

- Addressed the real-device report that newly installed local and direct-GitHub mods completed quickly in 3.2.2 but did not appear in Gen1Recomp’s in-game mod manager.
- Identified an upgrade-state gap: the persistent component registry could keep selecting an installed engine generated by an older suite patcher. That engine remained hash-valid but predated `native-mod-packages` discovery, so packed archives were injected and then silently invisible to the genuine loader.
- Added an explicit engine patch revision to installed component state. State without the current revision now falls back to the pinned bundled engine, while future verified engine updates are stamped with the current revision.
- The fallback is local and non-destructive: installed mods, saves, ROMs, settings, and the older engine file are not deleted, and mods do not need to be re-imported.
- No new API, permission, network destination, emulator path, PRO feature, or host archive dependency was added.

## 3.2.2 — 2026-08-12

### Kanto Ascendant first-run fix

- Reproduced the exact public Kanto Ascendant v6.0.11 failure with genuine Gen1Recomp: `trainer_rematch@6.0.11` loaded, compatibility PhysFS reported missing `save/mod-derived/trainer_rematch/.stamp`, and the runtime never reached `game loaded` even after 240 seconds.
- Guarded the optional first-transform stamp with `getInfo` before `read`, matching its intended first-run semantics and the existing compatibility-runtime missing-file rule.
- Added Web-only cooperative asset transforms: genuine gameplay starts before expensive ROM-derived art completes, one image is committed per frame, errors remain attributed, a native-style runtime badge reports progress, and the completion stamp suppresses repeat work.
- Verified 302 Kanto Ascendant images completed after gameplay started; a synchronized cached launch skipped regeneration.

### Packed and responsive mod pipeline

- Changed new installs from thousands of extracted native files to one normalized, integrity-pinned `package.zip` per mod. Existing expanded installs remain supported.
- Continued full path/type/size/CRC/manifest verification, then reused each verified stored/DEFLATE payload without recompression and stripped only an optional wrapper plus known platform metadata.
- Rechecks package SHA-256 and bounded central structure before every launch, injects one archive, and mounts it lazily at genuine `mods/<id>` through LÖVE/PhysFS.
- Clears stale expanded and packed browser trees before injection, so removed/updated packages cannot survive in IDBFS.
- Split scan and CRC verification into cooperative batches with visible percentages. This keeps the native page responsive without falsely treating `Promise.all` as CPU parallelism in the required no-pthreads runtime.
- Added `.modpkg` picker visibility while retaining the same ZIP parser and all payload restrictions.

### Direct GitHub release installation

- Added a localized **Install from GitHub** action accepting only strict repository/latest/exact-tag release URLs.
- Resolves the repository-bound GitHub API endpoint, selects an unambiguous bounded ZIP, displays metadata before confirmation, and retains mandatory published SHA-256 verification before preparation.

### Exact public regression

- GitHub Kanto Ascendant v6.0.11 ZIP: 16,662,061 bytes, 10,780 files, 17,743,467 extracted bytes, SHA-256 `72779b0a9923e2e3908573552858718aa09bc6eae25222d1268bf3f1e41b62e7`.
- Actual async preparer staged one 16,662,061-byte package in 0.750 seconds on the desktop host mock; no 10,780-file native tree was created.
- Fresh direct-file Chromium: mounted normalized package, loaded the exact mod, reached gameplay in 13.923 seconds, completed 302 background images by 20.321 seconds, then reached cached gameplay in 3.495 seconds with no rerun, HTTP/HTTPS request, or page error.
- Re-ran exact Wilds of Kanto v1.12.2 through the same path: 11,921 verified files became one 12,927,909-byte package in 0.891 seconds / 212 callbacks on the host mock; Chromium mounted it, registered all 151 sprites, and reached gameplay in 14.661 seconds without networking or a page error.
- Re-ran Dramatic Shape v1.8.2 through packed preparation: 257 verified files / 19,698,060 logical bytes became one 8,357,945-byte package in 0.397 seconds / 7 callbacks on the host mock.
- Desktop/mock timings are evidence only; packed mounting, progress/frame pacing, memory, and storage behavior still require the real-device checklist.

## 3.2.1 — 2026-08-12

### Full-screen native shell

- Changed the root presentation from an adaptive modal sheet to explicit full-screen presentation.
- Added a consistent upper-left `xmark` close action to Home, Games, Mods, and Settings while retaining native bottom navigation and finite dismissal lifecycle.
- Kept mod management dedicated to Mods and settings/update controls dedicated to Settings.

### Legitimate large-mod compatibility

- Replaced the shared 2,048-entry/file ceiling with independent guarded limits: 40,000 ZIP entries, 32,768 regular files/archive, 49,152 aggregate installed files, 64 MiB compressed, 128 MiB extracted/installed, 32 MiB/file, and 256 KiB package manifest.
- Restricted package-manifest discovery to archive root or exactly one wrapper directory, preventing deeper asset manifests from being misclassified as duplicate package manifests.
- Retained path traversal, absolute/case collision, overlap, symlink, encryption, ZIP64/multi-disk, unsupported compression, CRC, payload-type, manifest, per-file, and transactional replacement protections.
- Added local mod file/byte totals and a large-library warning above 10,000 files.
- Parsed, extracted, and CRC-verified the exact public Wilds of Kanto v1.12.2 release, then passed it through the actual host-mocked `prepareModArchive()`: 11,955 ZIP entries, 11,921 files, 15,860,867 bytes, `overworld_wild_spawns@1.12.2`, SHA-256 `7272a62c7d72f069295281835c0a6cdbaccd2bcf0c24b2b8284c90b9d68a8e3b`.
- The exact reported Stadium 2 Overworld Models v0.1.86 archive was not publicly located and is not claimed as package-tested.

### Mod health, LOAD REPORT, and diagnostics

- Added advisory native health for missing dependencies, installed-but-disabled dependencies, and enabled declared conflicts.
- Added explanatory `LOAD REPORT` help that preserves Gen1Recomp’s legitimate save/mod-set reconciliation instead of suppressing it.
- Added confirmation-gated local diagnostics export with suite/component versions, bounded settings/performance data, mod metadata/health, and update summary. ROM bytes, saves, ROM filenames/hashes, covers, screenshots, browser profiles, and private logs are excluded; the temporary JSON is removed after sharing.
- Added matching English/German strings and validator coverage.

### Evidence boundary

- The finalized v3.2.0 build is preserved unchanged as immediate rollback, and v3.1.1 remains the older audited fallback.
- TypeScript, Python/JSON, ROM/mod/ZIP, engine-update, runtime-bundle, manifest, deterministic packaging, reproduction, and privacy audits are documented in `VALIDATION.md`.
- The user confirmed v3.2.0 runs perfectly. The new v3.2.1 full-screen presentation, close controls, large-import responsiveness, health/report UX, and diagnostics still require the named real-device checklist.

## 3.2.0 — 2026-08-12

### Native navigation and settings

- Replaced the single long dashboard with native **Home, Games, Mods, and Settings** bottom tabs; Mods is now a dedicated surface rather than a dashboard section.
- Centralized English/German strings and retained the finite `Navigation.present` → `Script.exit` lifecycle.
- Added persisted visual-mod profile, save mirror timing, automatic-check preference/schedule, and bounded latest-session performance metric with backup recovery.
- Added Balanced and Efficient primitive-only Dramatic Shape presets while retaining a Mod-default quality profile that injects no overrides.

### Stutter and performance work

- Passed 10/15/30/60-second save mirror timing to the local runtime instead of hardcoding the periodic interval.
- Added bounded ten-second frame sampling for average FPS, percentage of intervals over 25 ms, and worst interval; only the latest validated aggregate is retained locally.
- Added a native settings view that explains quality/performance tradeoffs and applies selected compatible mod options on the next launch without modifying third-party code.

### Update Center and modular component management

- Added a strict data-driven catalog for the bundled Gen1Recomp engine, coupled LÖVE JavaScript/WASM pair, featured-mod sources, limits, hashes, and performance presets.
- Added direct and opt-in scheduled checks for the engine, runtime source commit, and every installed sourced mod. Checks never install automatically.
- Added digest/size-verified official `.love` updates with guarded on-device reproduction of the approved Web patches and immutable bundled rollback.
- Added a manual runtime-bundle importer that requires schema-1 metadata, exact JS/WASM hashes, a source commit, valid WASM header, compatible filesystem anchor, and no pthread/SharedArrayBuffer markers.
- Made engine/state and two-file runtime/state replacement explicitly transactional with staging, backups, and rollback; JavaScript and WASM cannot be replaced independently.
- Added one-confirmation **Update all mods**, while retaining per-asset GitHub digest and full archive/manifest validation.

### ZIP and engine-patch verification

- Added a repacked-ZIP writer that reuses verified stored/DEFLATE payloads for unchanged entries and stores only patched/new files.
- Reduced dynamic on-device engine-patch output from 14,158,313 to 4,515,518 bytes.
- Verified 454 dynamic output files with local CRC checks, Python `ZipFile.testzip()`, and byte-for-byte extraction comparison against the Python-built bundled engine.
- Rebuilt the bundled engine with synchronized native-mod-options support; SHA-256 is `5a50fa79618af959f48db2813717f483cab3e1191f2ec0a6e4886325165ad2d5`.

### Evidence boundary

- TypeScript diagnostics, static validation, ROM/mod/ZIP tests, runtime-bundle construction, and dynamic engine reproduction pass in the desktop workspace.
- A private direct-file 390×844 Chromium run proved exact Balanced options, bounded telemetry delivery, visible genuine gameplay, and same-origin Mod-default reset on cached relaunch; all temporary private inputs were removed.
- The user previously confirmed 3.1.1 genuine gameplay and Dramatic Shape on-device; the new 3.2.0 native UI, update transactions, telemetry bridge, timing, and performance profiles still require the device checklist.

## 3.1.1 — 2026-08-12

### Free-tier archive correction

- Supersedes 3.1.0: the user’s installed free Scripting build reported that the documented `Archive` API requires Scripting PRO.
- Removed every `Archive` reference and every `FileManager.zip/unzip` call from executable project code and the validation shim.
- Added a self-contained TypeScript ZIP reader with EOCD/central/local consistency checks, UTF-8/CP437 paths, Unix symlink detection, overlap and encryption rejection, bounded stored/raw-DEFLATE expansion, and per-file CRC-32 verification.
- Added a self-contained stored-ZIP writer for save export, so that path also has no host archive dependency.
- Added corruption, stored/fixed/dynamic/level-zero DEFLATE, Unicode/CP437, encryption, symlink, and ZIP-writing tests.
- Parsed and CRC-verified all 257 files (19,698,060 extracted bytes) from the public Dramatic Shape v1.8.2 ZIP using only the new implementation.

## 3.1.0 — 2026-08-12 — superseded on the free tier

### Native mod management

- Added a dedicated bilingual native Mods menu with installed/active counts, details, enable/disable, safe removal, ZIP import, source-page access, and explicit update checks.
- Added bounded, transactional ZIP inspection/extraction through documented Scripting `Archive`: traversal, absolute paths, case collisions, symlinks, unsupported manifests/APIs, and ROM/save/state/IPA payloads are rejected before install.
- Added `mods.json` plus backup, per-mod Documents storage, declared permission/dependency/conflict display, and explicit active-profile persistence.
- Added opt-in GitHub release updates restricted to each selected repository’s API/release URLs, bounded ZIP assets, and mandatory published SHA-256 verification.
- Added a direct on-demand install/update shortcut for the external `scottcandy34/DramaticShapeVoxelMod-latest` repository. The third-party mod is never bundled or redistributed.

### Genuine runtime integration

- Injects every installed mod under Gen1Recomp’s genuine LÖVE save-directory `mods/` root; disabled mods remain discoverable but their entry chunks do not run.
- Bridges `native_mod_state.json` both ways so native toggles and genuine **START → MODS** toggles converge after player close.
- Clears the previous browser-side mod tree before each package mount, preventing removed or updated files from surviving in IDBFS.
- Added Web-only standard-Lua compatibility for API-2 mod source (`loadstring`, UTF-8 BOMs, dormant LuaJIT integer suffixes), guarded missing optional files, and preflighted unsupported readable depth canvases so visual mods can take their internal-depth fallback.

### Mod verification

- Verified pure manifest/path/repository/version tests and deterministic `.love` rebuilding.
- Verified synthetic enabled/disabled profiles and stale-mod removal over direct `file://` relaunch.
- Downloaded public Dramatic Shape v1.8.2 only as a temporary fixture, matched GitHub SHA-256 `31a6a4e810610d540b830d411b6c47272407e9254b2969171aca780fcbe874f2`, loaded it with genuine Gen1Recomp/Yellow, reached `REDS_HOUSE_2F`, and rendered visible voxel lighting at 390×844. Private screenshots and the mod ZIP are excluded from delivery.

## 3.0.1 — 2026-08-12

### Free-tier serverless playback

- Removed the Scripting PRO-only `HttpServer`, `HttpResponse`, fixed port `17681`, loopback routes, and all listening-server lifecycle code.
- Replaced the transport with documented `WebViewController.loadFile()` and a fixed temporary local runtime path.
- Added generated `launch.js` injection for Base64-encoded `love.wasm`, combined Gen1Recomp/ROM/save bytes, and package metadata.
- Set `Module.wasmBinary` before love.js starts and changed the package loader to decode native-injected bytes directly, with no `fetch` or `XMLHttpRequest`.
- Tightened the runtime CSP to `connect-src 'none'` and the WebView policy to file/browser-internal schemes only.
- Preserved the bounded native save mirror and normal-close synchronization without relying on a web origin served by a port.
- Added cleanup for preparation failures and guaranteed removal of the ROM-bearing temporary launch directory on close.

### Verification and documentation

- Added free-tier/API checks to the static validator and removed server APIs from the validation host shim.
- Re-ran genuine canonical Yellow through direct `file://` Chromium startup, cached relaunch, 390×844 rendering, and byte-identical save restore/snapshot tests.
- Rewrote architecture, installation, privacy, validation, and device-qualification documentation for the serverless design.
- Marked 3.0.0 as superseded because its player could not launch on the required free Scripting tier.

## 3.0.0 — superseded (2026-08-12)

### Genuine Gen1Recomp runtime

- Removed the binjgb emulator, emulator WebView, quick-state bridge, and all emulator assets/notices.
- Added the verified official Gen1Recomp v0.1.78 `.love` package with six narrow, reproducible web-compatibility patches.
- Added Davidobot/love.js LÖVE 11.5 compatibility WebAssembly at pinned commit `c4f04e1`.
- Added strict local-ROM handoff into genuine `RomImporter:startPath`.
- Added a pure-Lua BitOp-compatible module required by standard Lua 5.1.
- Fixed missing-cache reads that stalled the compatibility runtime.
- Enabled Gen1Recomp’s own touch controls on Web and fixed narrow portrait layout.
- Avoided unsupported queueable-source looping calls while preserving ChipSynth loops.
- Added the allowlisted native save mirror, restore, structured export, strict ROM identities, bilingual native library, local covers, safe removal, and complete licensing/provenance documentation.

The 3.0.0 browser runtime was valid, but its native launcher used Scripting’s PRO-only local HTTP server. It is not acceptable for the required free-tier environment and must not be used.

## 2.0.2 — superseded

The previous build used a separate binjgb compatibility emulator. It was technically validated but did not satisfy the project’s required Gen1Recomp architecture and is fully removed from current builds.
