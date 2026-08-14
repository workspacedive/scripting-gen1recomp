# iPhone/iPad device qualification checklist

Target project: Gen1Recomp Native Suite 3.5.0  
Required host: current Scripting app with documented `WebViewController.loadFile()`  
Required tier: **free Scripting tier; no Scripting PRO APIs may be required**

Record device model, iOS/iPadOS version, Scripting version/build, subscription tier, free storage, and test date.

## 1. Import and native page

- [ ] Keep finalized, real-device-confirmed 3.3.0 as the immediate immutable rollback; import the separate 3.5.0 `.scripting` archive without a descriptor/project error.
- [ ] Without re-importing any mod, launch immediately after the upgrade. Confirm enabled legacy/local/GitHub mods still appear under genuine Gen1Recomp **START → MODS** and are reported mounted. Confirm disabled mods remain listed in the native Mods page/state but their payloads are absent from `mod_injection_inventory` and genuine runtime discovery until re-enabled for the next launch.
- [ ] Open the script and verify the page presents once and closes cleanly.
- [ ] Verify English and German strings by changing the device language if practical.
- [ ] Check light/dark appearance, Dynamic Type, VoiceOver labels, Reduce Motion, portrait, landscape, iPhone SE-size width, and iPad split view.
- [ ] Confirm the suite occupies the full screen rather than appearing as a sheet/card; verify the upper-left `×` is visible and dismisses cleanly from Home, Games, Mods, and Settings.
- [ ] Confirm the four bottom tabs switch reliably; check tab badges, the library empty state, covers, status banners, and cards for clipping.
- [ ] **Retained 3.2.9 navigation hotfix:** open an installed mod’s native **Mod settings**. Before the mod title, confirm a prominent upper-content **Back** button and separate **Close** button are both visible without scrolling. Tap **Back** and verify the installed Mods list returns with the same mod/state. Reopen the editor, tap **Close**, and verify the entire suite dismisses cleanly. Repeat once after rotating and once with large Dynamic Type; do not count a toolbar item alone as this pass.
- [ ] Verify Mods is not duplicated on Home and that Settings contains performance, save timing, updates, official release, **Console diagnostics**, privacy, and license actions.
- [ ] After one launch, confirm Console diagnostics shows nonzero event/session counts, byte size, error count, and either a latest-error preview or “no captured error”; verify the corresponding export retains the complete error. Close/reopen the entire suite and verify the journal summary persists.
- [ ] Export each TXT, JSON, JSONL, and CSV format. Confirm each system options menu appears, each file contains the same complete session/error text, and the temporary export copy disappears after the menu returns.
- [ ] Inspect context before sharing: it must contain suite/component versions and expected bounded metadata but no ROM bytes, save contents, original ROM filename/hash, cover data, gameplay capture, or browser profile. Because engine/mod console output is intentionally complete, separately inspect it for technical paths or gameplay state.
- [ ] Cancel the format action sheet and the system options menu; verify no error or stale temporary export. Confirm **Clear console logs** is destructive/confirmed, cancel once, then export before performing one controlled clear.
- [ ] Enable then disable Automatic update checks; relaunch before/after its selected interval and verify checks run only while opted in and never install automatically.

## 2. ROM import

Use only ROM dumps the tester is legally entitled to use.

- [ ] Cancel the document picker; verify no error and no empty library record.
- [ ] Import one canonical supported ROM; verify the title, cover, size, SHA-1 detail, and support badge.
- [ ] Import multiple supported ROMs in one selection.
- [ ] Re-import a duplicate; verify it is skipped without overwriting the existing record.
- [ ] Try a tiny file, oversized file, invalid header/logo, bad header checksum, and valid-but-unknown Game Boy ROM; verify each is rejected clearly.
- [ ] Verify imported ROM bytes remain under the suite’s local Documents folder and no network request occurs.

## 3. Genuine player first launch on the free tier

- [ ] Tap **Play in Gen1Recomp** and verify the architecture notice accurately says genuine Gen1Recomp, not an emulator.
- [ ] Confirm playback and mod import start without an upgrade prompt and without any `Thread`, `FileManager`, `HttpServer`, `Archive`, or other PRO API error. `Thread` and async FileManager must work on the named free-tier build.
- [ ] Confirm the build opens no listening port and has no dependency on port `17681` or any other port.
- [ ] Verify the loading screen appears, followed by Gen1Recomp’s extraction progress/game output.
- [ ] Allow at least 60 seconds on slower hardware before declaring a timeout.
- [ ] Verify a visible title/game frame appears; a merely black canvas is a failure.
- [ ] Verify no browser navigation or remote page can be opened from the runtime.
- [ ] With Web Inspector if available, verify the main document/resources are `file:`, chunk names match only `binary-wasm-NNNN.js` / `binary-package-NNNN.js`, and no HTTP/HTTPS runtime request occurs. Browser-internal `blob:`, `data:`, or `about:blank` may appear.
- [ ] Verify `/game.love` is the approximately 300 KiB layer and `/gen1recomp-core.love` is the separate exact 4,418,896-byte core—not a reconstructed patched core and not an executable copy in the writable save identity. Export diagnostics and locate `[gen1-layer] mounted layer=2.1.0 revision=9 core=0.1.78 sha256=4dfd…` followed by `precedence verified; entering immutable core` before normal game output.
- [ ] In a disposable Runtime Components copy, corrupt/remove only an installed layer or core. Confirm no partial installed pair activates and launch falls back to the bundled pair. Restore, then place a harmless marker file at the save-side path `src/mods/Loader.lua`; confirm it cannot shadow the layer module. Do not modify the bundled project assets.
- [ ] Export diagnostics and confirm `native_launch_contract`, separate layer/core verification and byte counts, transport bootstrap/decode/take events, exact WASM/package byte counts, browser `wasmValidation`/`wasmMemoryGrowth`, and no generated whole-payload `base64_decode_begin` event. The read-only `legacy_*` path must not be used by a fresh 3.5.0 launch.
- [ ] Close the player normally and verify no stale ROM-bearing launch/chunk file or `runtime-recovery.json` remains.
- [ ] In a disposable test, force-terminate Scripting while the player/preparation is active. Reopen and launch again; confirm `interrupted_runtime_recovered` records marker/directory detection, stale private chunks disappear before rebuild, the game still starts, and the suite does not claim work continued while terminated.
- [ ] In genuine **START → EXIT GAME**, choose exit. Verify the player dismisses back to the still-running dashboard instead of leaving a generic love.js alert or stranded WebView; then export TXT and locate the `emscripten:exit`, `close_requested`, `presentation_end`, final-sync/dispose, and temporary-runtime cleanup entries.
- [ ] Reproduce a controlled pre-ready fatal alert and verify the detailed fatal panel plus **Close player** button appears. Separately reproduce the PotatoVoxel post-ready generic alert: the alert itself must remain suppressed/logged as a warning and must **not** dismiss or hide running gameplay. Then trigger a controlled genuine `Module.onAbort`, `onExit`, uncaught window error, or unhandled rejection and verify that distinct terminal path returns to the dashboard. Export both traces before clearing.
- [ ] **Retained caught-exception regression:** with exact PotatoVoxel 1.4.4 enabled, load the same Yellow/Vermilion-area save. Revision 9 should prevent the known `Invalid vertex map value: 0` / continuous `actor decal pass aborted` sequence. If any different Lua-caught LÖVE exception still produces Davidobot’s generic post-ready alert, controls/gameplay must remain live for at least five minutes, no `browser-alert-after-ready` dismissal may occur, and the native trace must contain `caught_exception_alert` / `caught_exception_alert_retained` warnings. Close normally and verify final save sync/disposal/cleanup.
- [ ] Verify the exported failing session includes browser/capability bootstrap, user agent/viewport, package metadata, bounded chunk completion/take, every injected package file, WebAssembly initialization/abort/exit, all LÖVE console lines, JavaScript stack/line/column, WebGL events if any, native component/launch/recovery/request/save/cleanup stages, and no 400-character cutoff.
- [ ] Leave gameplay open for at least 30 seconds. Confirm repeated `runtime_telemetry` and `[native-telemetry]` records have finite plausible FPS/Wasm/Lua/draw fields; optional JS heap may be `null`. Force a real iOS memory warning if a safe development method exists and confirm one low-memory telemetry line/collection without a crash; otherwise mark that callback untested rather than synthesizing success.

### 3.5.0 measured performance regression — iPhone 16 Pro Max / iOS 26.6

Use the same ROM, save, enabled-mod set, profile, area, route, and play sequence as the supplied 3.4.0 TXT export. Record device thermal state, battery/power state, free storage, Scripting build, and whether Web Inspector is attached. Do not compare unlike mod sets.

- [ ] Before launch, record total installed mod bytes versus enabled mod bytes. Disable one large mod, launch, and verify its archive/directory bytes and ID are absent from `launcher:mod_injection_inventory`, package metadata, browser `native-mod-packages`/`mods`, and genuine discovery while the complete `native_mod_state.json` still records it as disabled. Re-enable natively; on the next launch verify its exact payload returns and it loads without reinstallation.
- [ ] With exact PotatoVoxel v1.4.4 enabled, locate the revision-9 marker for each transformed module. Confirm `SpriteBillboards.lua` receives exactly one fix, `OverworldBattle.lua` exactly two, and `VoxelScene.lua` exactly three. Any source-anchor mismatch must fail closed rather than applying a broad rewrite.
- [ ] Traverse the same walking route for at least 15 minutes and initiate at least ten battles, including the previously slow battle start. Capture per-window FPS, slow-frame percentage, worst-frame milliseconds, Wasm heap, Lua KiB, draw/batch/switch/object/texture fields, battle-start elapsed time, and device temperature. Compare equal windows against the supplied 3.4.0 run; report measurements rather than “feels smoother.”
- [ ] Verify `Invalid vertex map value: 0` does not recur from `SpriteBillboards.buildShadowBlob`. If a different setTexture/map error occurs, preserve the full traceback and do not call this check passed.
- [ ] Force or encounter one controlled `OverworldBattle` render failure. Verify one complete traceback is retained, the session becomes broken, and the same battle render is not retried every later update. Confirm the ordinary fallback remains playable or exits cleanly.
- [ ] Force or encounter one controlled actor-decal failure. Verify one `actor decal pass disabled after one failure` record with detail, no continuous `actor decal pass aborted` loop, ordinary lit gameplay remains visible, and later frames do not repeatedly rebuild the failed pass.
- [ ] Compare log volume and bridge/file-I/O behavior. Normal diagnostic traffic should cross `runtimeDiagnostic` in multi-entry envelopes (maximum 48 / 40 ms), and native persistence should use approximately 64 KiB / 75 ms ordered async batches rather than one append per message. Trigger one terminal path and immediately export TXT; the final event/error must be present despite batching.
- [ ] Leave the game unchanged across at least five configured periodic-save intervals. After the first accepted snapshot, verify later intervals emit `snapshot_skipped_unchanged`, do not emit a save payload, and do not Base64-read files. Then change one save/options file and verify exactly the changed inventory causes a complete accepted snapshot. Close normally and verify the final post-`syncfs` snapshot still includes all allowlisted files even when the inventory was previously unchanged.
- [ ] Do not infer that stable textures prove stable total memory or that lower logging proves the render work stopped. Pass requires the failure markers, frame/memory series, save events, mod inventory, and full exported log to agree.

## 4. Controls and display

- [ ] Verify Gen1Recomp’s D-pad, A, B, START, and SELECT are all visible in portrait.
- [ ] Press START and confirm the genuine NEW GAME / OPTION / EXIT GAME menu opens.
- [ ] Start a new game and verify D-pad movement, A interaction, B cancellation, START menu, and SELECT behavior.
- [ ] Hold a direction and press a face button simultaneously; verify multitouch works.
- [ ] Rotate during title, menu, and gameplay; verify the game and controls reflow without clipped A/B buttons.
- [ ] Verify touch targets remain usable around the home indicator, camera cutout, and navigation bar.
- [ ] Connect a controller if available and verify input does not leave touch state stuck.

## 5. Audio

- [ ] Tap a control to satisfy iOS user activation, then verify title/game music starts.
- [ ] Verify music loops without repeated console errors or silence after a track transition.
- [ ] Verify menu sound, cry/SFX, mute switch expectations, volume changes, Bluetooth route, interruption, background/foreground, and headphone unplug.
- [ ] Record any crackle, latency, or dropouts; Davidobot/love.js explicitly warns compatibility-mode audio can be imperfect.

## 6. Saves and persistence

- [ ] Test each 10/15/30/60-second Save mirror interval with expendable progress; create an in-game save and leave the player open beyond the selected interval.
- [ ] Close the player normally; verify `Gen1Recomp Saves` appears in the suite Documents directory.
- [ ] Relaunch the same game and verify CONTINUE and progress.
- [ ] Force-close Scripting immediately after another save, relaunch, and document whether the periodic mirror retained the latest state.
- [ ] Restart the device and verify the native mirrored save remains.
- [ ] Launch another supported version, save it, and verify both versions coexist.
- [ ] Export ROM & synced saves; verify the locally written stored ZIP opens without a PRO prompt, inspect its structure, and restore it in a controlled test if possible.
- [ ] Test **Remove ROM · keep saves**, re-import, and verify progress returns.
- [ ] Test **Remove ROM & saves** only with expendable data; verify that version’s mirrored saves are removed and shared options remain.
- [ ] Clear Scripting website data separately and confirm the native mirror restores the next launch.
- [ ] Time first and second launches. Record whether file-origin IndexedDB preserves the ROM-derived cache; a repeat extraction is a performance issue, while loss of the native mirrored save is a correctness failure.

## 7. Library and covers

- [ ] Add/change/reset a custom cover.
- [ ] Reject a cover over 20 MiB.
- [ ] Verify deletion requires the two-step destructive flow.
- [ ] Verify library metadata recovers from `library.backup.json` after a controlled malformed-primary test.
- [ ] Verify a migrated unsupported 2.x record has no Play action but can be exported/deleted.

## 8. Mod import, profiles, and genuine manager

Use only mod archives whose source and permissions the tester trusts. Keep expendable saves for destructive/malformed tests.

- [ ] Cancel the mod document picker; verify no error, staging directory, or empty metadata record.
- [ ] Import one stored and one DEFLATE-compressed known-good API-2 mod ZIP plus a wrapper-directory variant; verify no Scripting PRO prompt appears and manifest details, permissions, dependencies/conflicts, size, and source appear accurately.
- [ ] Try archives with `../`, absolute paths, case-colliding names, a symlink, encryption, overlapping headers, bad CRC, unsupported compression, ZIP64/multi-disk structure, ambiguous root/wrapper package manifests, missing entry file, unknown permission, ROM/save/IPA payload, >40,000 entries, >32,768 regular files/archive, >49,152 aggregate installed files, >32 MiB file, >256 KiB package manifest, and >128 MiB extracted/installed total; verify rejection leaves the prior install untouched.
- [ ] Verify deeper asset `manifest.json` files are allowed when exactly one package manifest exists at root or one wrapper level.
- [ ] Import the exact public Wilds of Kanto v1.12.2 release. Confirm it installs as `overworld_wild_spawns@1.12.2`, reports about 11,921 files / 15.1 MiB, shows monotonic scan/verification/packing progress, keeps tab/navigation/close interaction responsive between worker batches, writes one `Mods/overworld_wild_spawns/package.zip` rather than 11,921 native files, and does not raise an entry-count or PRO error. Record import duration, progress callback count, peak memory, temperature, interruption behavior, and any visible main-thread stall.
- [ ] Repeat with Kanto Ascendant and one synthetic legal 32 MiB entry. Confirm the single-entry verification batch does not exceed file limits, CRC/repack completes, and low storage/write failure removes staging while preserving the prior install. Force-close during preparation: no partially prepared package may install; retry must start from the verified source/download state.
- [x] **3.2.6 Wilds guard evidence received:** the target-iPhone TXT contains `[native-compat] guarded unsupported ImageData PNG encode`, 1,298 runtime sheets ready, all 151 sprites registered, Route 2 spawns, and two completed Wilds battles. It contains no `No suitable image encoder for rgba4 format` recurrence. The later generic alert is a distinct first-error diagnostics failure, so this check confirms the guard but not long-session stability.
- [ ] **Retained first-error diagnostics regression:** enable the same complete mod set and load the same Route 2 save. Continue for at least ten minutes or until the prior failure recurs. Confirm there is no `Could not open file lua-error.log. Does not exist.` line and no misleading generic initialization alert. If a Lua failure occurs, leave the LÖVE error screen open briefly, then close the player normally and export readable TXT. The export must contain `[native-lua-error]`, an explicit `love:lua_error`/`runtime:status_error`, and the originating source/traceback before save/dispose/cleanup records. The snapshot should include `lua-error.log` (and `.1` only if rotation occurred). Return that complete TXT for the next root-cause pass; do not infer the failing mod from temporal proximity alone.
- [ ] Relaunch after the controlled failure and close once more. Confirm the allowlisted Lua-error history is restored/mirrored without rejecting the save snapshot, while CONTINUE and normal save progress remain intact.
- [ ] Disable only Wilds and repeat once; confirm the archive still mounts and remains listed but its entry does not load. Re-enable it for one more successful launch to prove native activation state and patch behavior are independent.
- [ ] Paste `https://github.com/Roxas2712/kanto-ascendant/releases/tag/v6.0.11` into **Install from GitHub**. Verify the exact repository/tag API, 16,662,061-byte ZIP, and published SHA-256 `72779b0a9923e2e3908573552858718aa09bc6eae25222d1268bf3f1e41b62e7` are shown before download/install.
- [ ] Import Kanto Ascendant v6.0.11 from both its `.zip` and `.modpkg` picker-visible assets in separate clean tests. Confirm `trainer_rematch@6.0.11`, 10,780 files / 17,743,467 bytes, one packed local archive, and no missing-stamp freeze.
- [ ] On Kanto Ascendant’s first launch, verify genuine gameplay appears before ROM-derived art finishes, the small progress badge remains responsive, 302 images complete, saves/controls continue working during processing, and no long single-frame freeze, crash, or black screen occurs. Close only after completion, relaunch, and verify the completed stamp skips regeneration.
- [ ] Inspect launch-time storage with available tools: the package should be mounted lazily at genuine `mods/trainer_rematch`, not expanded into 10,780 Emscripten files. Remove/update it and verify stale `native-mod-packages` content does not survive.
- [ ] Install exact Kanto Life 0.6.1 from `jtfresh90/Kanto-Life-Mod`. Confirm the original package SHA-256 remains `4b4eacec9fdb05822c8f1164cd1b19743d15f51c48e6df328adcc99e2d086031`, it appears under genuine **START → MODS**, no line-303 `goto continue` syntax error appears, the runtime reports three compatible loops and `loaded mod kanto_life 0.6.1`, and its options/basic NPC behavior open without a new attributed error.
- [ ] Re-test at least one mod installed by 3.2.1 as a legacy expanded directory; it must remain functional. Re-import it under 3.5.0 and verify transactional conversion to packed storage.
- [ ] If the exact Stadium 2 Overworld Models v0.1.86 archive is available to the tester, record its SHA-256/entry/file/byte counts, import result, launch behavior, and any failure verbatim; do not substitute the different Stadium 2 importer project.
- [ ] Replace the same ID/version and then an upgrade only after explicit confirmation; verify removed old files do not survive.
- [ ] Disable the mod natively, launch, and confirm it remains listed in genuine **START → MODS** but does not execute.
- [ ] Toggle the mod inside genuine **START → MODS**, close normally, and confirm the native menu reflects the new state. Relaunch and verify the choice executes only on the next boot.
- [ ] Import exact Wilds of Kanto 1.12.2 and open its native **Mod settings** before first launch. Confirm all 18 literal rows appear with the same labels, types, choices, ranges, and declared defaults as genuine Gen1Recomp; no code-execution prompt, hang, network request, or unrelated side effect may occur during discovery.
- [ ] Install exact Kanto Life 0.6.1, Kanto Ascendant 6.0.11, and Dramatic Shape 1.8.2 before launching them. Confirm each native card explains that settings require one genuine launch rather than pretending a schema is known. Launch each enabled mod once, close normally, and confirm 10, 45, and 14 captured rows respectively now appear, tagged to the installed version.
- [ ] **Retained dynamic-schema regression:** install exact PotatoVoxel 1.4.4 (published ZIP SHA-256 `f9bedd5c1ed1074427fb5a6e3d5acac501f0cc0fba7be3c5516d12abecbb2c64`), enable it, launch once, and close normally. Native Mods must show 12 Web-compatible rows: RENDER SCALE, V-GRID, V-CURVE, WATER, FOREST FX, 3D-BTL, BACK SPRITES, STADIUM SPRITES, DAYTIME, AA, SHADOWS, and SHADOW QUALITY. Open SHADOWS and verify both ON/`true` and OFF/`false` work; the false value must not erase the schema. Edit at least one number/string/boolean-valued choice, relaunch, verify in-game/native convergence, then restore genuine defaults.
- [ ] Install a controlled dynamic schema with one malformed/unknown row beside valid rows and an object-form `{ label, value = false }` choice. Confirm only the malformed row is skipped, valid siblings appear, no executable schema runs in native UI, and diagnostics attribute the skipped count.
- [ ] Exercise every native editor type: toggle a boolean, choose a listed value, enter minimum/maximum/step-aligned numbers, and edit a text row where available. Confirm invalid/out-of-range input is rejected clearly, Save commits once, the card reflects saved values, and the next launch exposes the same values in genuine Gen1Recomp.
- [ ] Change the same rows inside genuine **START → MODS** (and one compatible custom menu if available), let the upstream save complete, then close normally. Confirm the native editor reflects those writes without losing unrelated settings. Relaunch once more to verify persistence across Web/native boundaries.
- [ ] With Balanced or Efficient selected, set one catalog-managed value explicitly. Confirm the explicit native/in-game choice wins. Select a different performance profile and confirm only that profile’s managed keys are reseeded; unrelated explicit mod values remain unchanged.
- [ ] Tap **Restore genuine defaults** for one mod, cancel the confirmation once, then confirm it. Verify explicit values for only that mod disappear, preset seeding is suppressed for that mod, and the next launch uses the currently installed mod’s declared defaults. Confirm unrelated mods/settings remain unchanged. Deliberately select a performance profile again and verify its managed keys become active again.
- [ ] Update or replace one mod with a different version. Before runtime discovery, confirm the stale schema is not rendered as current. Launch once, verify the new schema/version is captured, safe still-valid primitive values reconcile, removed keys do not reappear, and a restored default comes from the new version.
- [ ] Remove then reinstall a mod. Confirm its shared upstream-compatible primitive option values can return when keys remain valid, while stale schema/probe metadata does not masquerade as belonging to the reinstalled version.
- [ ] Interrupt/force-close around a native option save and around a runtime snapshot in controlled tests. Reopen and verify primary/backup recovery yields one complete bounded state rather than partial JSON or an older cached runtime mirror overwriting a newer in-game write.
- [ ] Install a controlled manifest schema containing executable syntax (`local`, function call, expression, or trailing statement) and another malformed/oversized schema. Confirm native discovery declines them without executing code; ordinary mod installation remains governed by the existing manifest/archive rules, and genuine sandboxed runtime discovery remains the only dynamic path.
- [ ] Install controlled metadata fixtures and verify native health distinguishes a missing dependency, an installed-but-disabled dependency, and an enabled declared conflict without changing any mod automatically.
- [ ] After enabling, disabling, removing, and updating a mod, verify Gen1Recomp’s genuine `LOAD REPORT` still appears when appropriate; confirm the native help correctly explains “no longer active”/“newly active” as save/mod-set reconciliation and does not suppress the report.
- [ ] Remove the mod, relaunch, and verify no stale browser-side copy remains. Confirm saves remain.
- [ ] Corrupt `mods.json` in a controlled test and verify recovery from `mods.backup.json` without touching extracted files.

### Dramatic Shape example

- [ ] From the native Dramatic Shape card, review the executable-code/permissions notice and cancel once; confirm no network side effect before the explicit action.
- [ ] Install the current `scottcandy34/DramaticShapeVoxelMod-latest` release; verify only that GitHub repository’s API/release URLs are contacted and the published SHA-256 is checked before install.
- [ ] Launch canonical Red/Blue/Yellow gameplay with the mod enabled; reach a free-roam overworld map and tap on-screen **SELECT**. Verify the flat view cycles to a visible voxel view rather than a black frame or frozen UI.
- [ ] Run Dramatic Shape once each with Efficient, Balanced, and Mod-default profiles. Confirm profile values seed only catalog-managed keys without explicit choices, explicit native/in-game choices win, Mod-default clears catalog seeding, and downloaded code is unchanged.
- [ ] Walk, open menus, cycle several voxel angles with SELECT, and record the suite’s average FPS/slow-frame/worst-frame metric plus memory pressure, temperature, rotation, and touch behavior. Compare profiles on the same map/angle.
- [ ] Disable Dramatic Shape natively and verify the next launch is flat. Re-enable it and verify the next launch restores its own visual options.
- [ ] Treat Pokémon Stadium battle models as optional and unsupported by this suite’s importer: no Stadium ROM is bundled. Verify ordinary voxel and 2D-3D features work without one.

## 9. Update Center and explicit network operations

- [ ] With networking disabled, tap **Check all components**, the official release card, and a mod update; verify bounded errors and no library/component corruption.
- [ ] Open **Settings → Download Manager**. Confirm its empty state, English/German copy, determinate linear bar, byte total, speed, state, retry attempt, resume label, and Pause/Resume/Cancel/Clear controls do not clip in portrait, landscape, Dynamic Type, or VoiceOver. During a GitHub mod download, confirm the same live card appears directly on Mods.
- [ ] Throttle Wi-Fi or use a controlled proxy to interrupt an engine update after several chunks. Confirm status changes to retrying with bounded delay, the persisted partial byte count never moves backward unless a clean restart is explicitly reported, and completion proceeds only after exact size/SHA-256 verification.
- [ ] Pause an active mod download, fully dismiss/reopen the suite, and confirm the record reopens paused with the filesystem-reconciled byte count. Resume and verify the request starts at that exact byte using `Range`, returns matching `206 Content-Range`, and then installs transactionally. In a controlled disposable Documents copy, interrupt/corrupt the primary `downloads.json` while retaining fixed `downloads.backup.json`; verify reopen recovers one sanitized paused queue and leaves no stale `downloads.tmp.json`. Force-close Scripting once; verify the suite makes no false claim that transfer continued while terminated.
- [ ] Against a controlled server that ignores Range and returns `200`, interrupt/resume and confirm the manager labels a clean restart, discards the old partial before writing full bytes, and never concatenates. Also test invalid/mismatched `Content-Range`, `416`, overlong response, wrong expected size, and wrong SHA-256; no partial may reach a component, mod preparation, IPA share menu, or installed library.
- [ ] Test `429` with bounded `Retry-After`, `408`, `425`, one 5xx, a timeout, and six consecutive failures. Confirm retries stop at six, the failed partial remains explicitly resumable, Cancel deletes it, and no unbounded queue/log/UI growth occurs.
- [ ] Queue/update multiple mods and verify one bounded active transfer at a time, independent records, correct titles, safe cancellation, and no cross-installation. After preparation/install succeeds, its completed manager record/partial must be removed; a preparation/install failure must leave the prior installed mod/component intact.
- [ ] Check all online; verify Gen1Recomp engine, runtime source, and every sourced mod are represented without automatic installation.
- [ ] Begin with a genuine 3.4.0 revision-8 installed core/layer pair (for example the supplied-log 0.1.81 state). On first 3.5.0 launch, verify migration occurs before activation, retains the exact installed core bytes/hash/mtime, generates and post-verifies revision-9 layer bytes, commits revision-9 state, reports `execution_layer_migrated`, and runs the installed core. In a disposable copy, inject failure after backup and after state commit: verify exact revision-8 layer bytes/state are restored, the launch reports migration failure, and the complete bundled layer/core pair activates—never old layer plus bundled core or vice versa.
- [ ] On the upgraded installation, confirm 3.5.0 ignores preserved materialized/revision-7-or-older override state and uses the bundled layer/core pair. Check online and install a strictly newer verified Gen1Recomp release; confirm revision 9 becomes active, exact downloaded bytes remain `gen1recomp-core-active.love`, the small generated source is `gen1recomp-layer-active.love`, both hashes verify, and ROMs/saves/settings/mods remain. Inject failure before/after each component rename and verify both files plus prior state roll back together; attempt a downgrade and confirm monotonic-version rejection.
- [ ] Generate a trusted layer-only v2.1.1 for the exact active core and use **Import execution-layer update**. Confirm the core file/hash/mtime are unchanged; Settings shows layer v2.1.1 as installed; launch diagnostics show `selectedLayerSource=installed`; and games/saves/mods remain. Reject same/older version, wrong core digest/bytes/version, revision, suite minimum, missing protected target, undeclared file, bad per-file hash, unsafe/duplicate path, and oversized archive. Inject failure after prior-layer backup and verify layer bytes/state roll back. Corrupt the override and verify launch uses the complete generated/bundled layer, never a partial mix. **Restore generated execution layer** must remove only the override.
- [ ] In a disposable save tree, add malicious `src/update/Boot.lua`, `updates/pending.txt`, and a named `.love` whose `Version.lua`/`main.lua` write unmistakable markers. Launch and confirm the save Boot and archive never execute, `[gen1-layer:update-policy]` reports bounded cleanup, only valid updater payload names/pending marker are removed, and normal unrelated save files remain. Reopen and confirm cleanup remains stable. This test must be done without a real user save backup as the only copy.
- [ ] If a newer official `.love` exists, verify the repository-bound name/size/digest, guarded browser patch, launch, and **Restore bundled engine**. Inject/cause a staging write failure if safely possible and confirm the old engine plus state remain usable.
- [ ] Build a trusted test runtime ZIP with schema-1 manifest. Verify declared JS/WASM hashes, WASM magic, 40-hex commit, no-pthreads checks, coupled install, launch, and **Restore bundled Web runtime**. Test a bad hash, bad WASM header, threaded marker, missing file, and second-file write failure; old JS/WASM/state must remain together.
- [ ] With networking disabled, tap the official release card and a mod update; verify a bounded error and no library corruption.
- [ ] With networking enabled, verify only the selected GitHub repository’s release API is contacted during each Check.
- [ ] Open release notes; verify Safari appears only after the explicit action.
- [ ] If an IPA asset with GitHub digest exists, download it and verify size/digest validation before the share menu.
- [ ] Cancel download/share and verify no partial file is presented as verified.

## 10. Resource and lifecycle stress

- [ ] Repeat player open/close ten times; verify no accumulating modal, temporary ROM-bearing launch file, WebView, or obvious memory leak.
- [ ] Measure iOS process peak memory during first launch with no mods, then the largest intended mod set. Compare 3.5.0 bounded chunks against the same 3.3.0 library/device: record peak, launch-to-ready time, jetsam/crash status, Wasm heap, optional JS heap, and chunk counts. Do not infer process memory solely from JavaScript heap telemetry.
- [ ] Background during extraction and resume.
- [ ] Lock/unlock during gameplay.
- [ ] Receive a call/audio interruption if practical.
- [ ] Test low-storage behavior before import/extraction and verify understandable failure plus temporary-file cleanup.

## Sign-off

Do not mark 3.5.0 device-qualified until free-tier `Thread`/async FileManager import and launch paths; genuine revision-9 layer-first boot/separate immutable-core mount/save-shadow resistance; revision-8 migration and failure fallback; exact PotatoVoxel map/battle/decal behavior; sustained same-route walking/battle frame-time and memory comparison; diagnostic batching/terminal durability; unchanged periodic-save suppression/full final snapshot; enabled-only mod payload/re-enablement; Wilds/Kanto worker responsiveness; 1 MiB chunk startup/peak-memory comparison; forced-termination recovery; and two-file layer/core update/rollback pass on the named device/build. Retained PotatoVoxel caught-alert/12-row behavior, download resume controls, Back/Close, first-error diagnostics, full-screen tabs, editor/profile state, exports, terminal return, gameplay/controls/audio/saves, packed/legacy mods, Kanto transforms, health/report UX, Dramatic Shape, cleanup, and file-only/no-network boundaries must also remain passing. Keep 3.3.0 as rollback until then. Inspect complete engine/mod text before attaching logs; never attach ROM bytes, save contents, or private gameplay captures.
