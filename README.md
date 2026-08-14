# Gen1Recomp Native Suite 3.6.0

A complete **Scripting for iOS/iPadOS** project that runs the genuine Gen1Recomp Lua/LÖVE recreation locally with ROM files supplied by the user.

This version does **not** contain a Game Boy emulator. It bundles:

- the byte-exact verified official Gen1Recomp v0.1.78 `.love` as an immutable local core, plus a separately versioned 14-file executable compatibility/protection layer that boots around and ahead of that unchanged core;
- the MIT-licensed Davidobot/love.js LÖVE 11.5 compatibility runtime;
- a native Scripting library UI, ROM validation, attractive local covers, local save mirroring, export, and opt-in official release checks.

No ROM, save, gameplay capture, account credential, analytics SDK, or remote player resource is included.

> **Important:** 3.6.0 keeps the completed 3.4.0 worker/chunk/recovery architecture and directly addresses the supplied iPhone performance trace. That trace recorded 549 repeated actor-decal aborts, 262 identical vertex-map failures, frame rate falling from 45.18 to 3.79 FPS, Wasm growth from 256 to 856 MiB, and Lua telemetry reaching 555,156.7 KiB. Revision 9 therefore applies exact-source, exact-path PotatoVoxel v1.4.4 fixes: the one Lua-table shadow map becomes one-based, a broken overworld battle retires after its first detailed failure, and a failed actor-decal pass latches off instead of reallocating/retrying every frame. It also sends only enabled mod payload bytes to the temporary runtime, batches ordered diagnostics at both bridge and native-file boundaries, and avoids Base64-reading unchanged periodic saves while preserving full final snapshots. Existing revision-8 installed core/layer pairs migrate locally and transactionally before activation; any migration failure restores the old bytes/state and selects the complete bundled pair. The unchanged official v0.1.78 core remains SHA-256 `4dfd6e78808024eda0cce8b9fa5434a5846d1aa327912f7a1ce3c888e416c4fe`; the separately versioned 312,056-byte layer 2.1.0 is SHA-256 `d0f9fbc9af9e2d11a26ad1a3c5639205c8d32f62941d7fc3847249d69314ca71`. No patched-core materialization, emulator, PRO API, ROM, or mod is shipped. Version 3.3.0 remains the user-confirmed rollback; 3.6.0 requires the device checklist before its performance effect is claimed on iOS.

## What it does

- Imports multiple compatible `.gb`/`.gbc` files from the iOS document picker.
- Verifies the Game Boy header/logo/checksum, file-size limit, and complete SHA-1 identity before accepting a ROM.
- Recognizes the canonical ROM revisions supported by Gen1Recomp v0.1.78.
- Stores imported ROM copies and optional custom cover images in the suite’s local Documents folder.
- Runs the real Gen1Recomp code in a bundled local LÖVE/WebAssembly WebView.
- Boots from a genuine executable layer rather than a patched-core reconstruction: native and Lua both verify the separate core, LÖVE mounts it behind the layer, writable saves remain behind executable sources, and corrupt/absent installed pairs fall back or fail before core execution.
- Uses documented `WebViewController.loadFile()`; normal playback requires no local server and no Scripting PRO API.
- Enables Gen1Recomp’s own on-screen D-pad, A, B, START, and SELECT controls.
- Keeps Gen1Recomp’s ROM-derived cache in WebKit IndexedDB when file-origin persistence is available.
- Mirrors Gen1Recomp saves into `Gen1Recomp Native Suite/Gen1Recomp Saves` and restores that mirror on the next launch.
- Imports validated native Gen1Recomp ZIP or `.modpkg` files, exposes enable/disable controls, and supports explicit verified GitHub release updates. Only enabled mod payloads enter a launch package; the complete installed enablement mirror remains available so a disabled mod can be re-enabled for the next launch without reinstallation.
- Shows each installed mod’s captured Gen1Recomp settings directly on the native Mods page, with native toggle/choice/number/text controls, a per-mod **Restore genuine defaults** action, and visible in-content **Back**/**Close** escape controls independent of toolbar refresh behavior.
- Discovers declarative `options_schema` files only through a bounded literal-table parser and captures dynamic schemas only from the genuine running engine; arbitrary installed Lua is never executed by the dashboard. Dynamic RFC-0008 tuples and common `{ label, value }` choices preserve `false` correctly, text accepts bounded `maxLen`/`maxLength`, and one malformed row no longer erases valid sibling settings.
- Mirrors in-game option writes back through the transactional save bridge, so native and in-game menus converge while performance presets remain compatible.
- Normalizes newly imported mods into one integrity-pinned compressed package and mounts it lazily through Gen1Recomp’s real LÖVE/PhysFS filesystem, avoiding thousands of native and Emscripten file creations on every launch.
- Compiles Web mod source through strict in-memory compatibility gates: the terminal-label continue idiom used by Kanto Life 0.6.1; the exact Wilds 1.12.2 Canvas ImageData guard; and exact-path/exact-source PotatoVoxel v1.4.4 shadow-map, battle-retirement, traceback, and actor-decal-latch fixes. Arbitrary goto flow remains rejected, unrelated paths stay byte-identical, and installed archives are unchanged.
- Parses, verifies/decompresses, and repacks large archives in bounded `Thread.runInBackground` stages; progress callbacks run only after each worker batch returns to the initiating thread. The fallback on an older host preserves correctness on the main thread and is reported honestly. This native preparation worker is distinct from—and does not enable—pthreads inside the deliberately no-pthreads LÖVE WebAssembly runtime.
- Accepts an exact GitHub repository or release URL, resolves only its repository-bound release API/assets, then retains the existing confirmation, size, and published-SHA-256 gates.
- Streams engine, GitHub-mod, and IPA assets into persistent partial files with determinate native progress. Transient failures retry with bounded backoff; pause/interruption resumes with `Range` plus validated `206 Content-Range` and `If-Range` where available. A server that answers a resumed request with `200` triggers a clean restart instead of concatenation. Queue metadata uses fixed `downloads.json` / `downloads.tmp.json` / `downloads.backup.json` transaction files, recovers from an interrupted or corrupt primary, and reconciles byte counts from the actual partial file on the next process. Partial, wrong-size, or digest-failing bytes never enter transactional installation. iOS termination cannot continue in the background, but the next attempt can resume the saved file.
- Defers expensive first-run ROM-derived artwork transforms until after genuine gameplay starts, processes one generated image per frame, displays progress, and reuses the completed stamp on later launches.
- Offers an on-demand installer/updater for the external Dramatic Shape Voxel Mod example without bundling or redistributing it.
- Exports the original ROM copy and, when present, a structured save ZIP.
- Uses a true full-screen **Home, Games, Mods, and Settings** interface with an upper-left close action on every tab, keeping mod management out of the dashboard.
- Summarizes missing or disabled dependencies and active declared conflicts before launch, and explains why Gen1Recomp may legitimately show a `LOAD REPORT` after the enabled mod set changes.
- Shows local mod file/byte totals and warns when a library exceeds 10,000 files.
- Persists a high-detail local console trace across player dismissal and dashboard relaunch: browser console methods, JavaScript errors/rejections, Emscripten abort/exit, LÖVE output, WebGL events, package/bridge/save/cleanup stages, and native error stacks. Browser records cross the native bridge in ordered batches of at most 48 entries or 40 ms; native JSONL is appended in ordered approximately 64 KiB / 75 ms asynchronous batches, with one complete-batch synchronous fallback if the documented async append fails. Explicit exports, clear, session end, and terminal cleanup flush pending evidence first. Journal/export messages are not sampled or shortened; oversized text is retained in numbered chunks. Settings keeps only the latest-error card preview bounded for responsive rendering, while exporting complete `.txt`, `.json`, `.jsonl`, or `.csv` files through the documented iOS options menu. CSV formula-leading cells receive a protective apostrophe for spreadsheet safety; JSON/JSONL retain the exact machine-readable field value.
- Keeps logs local until explicit export and excludes ROM bytes, save contents, original ROM filenames/hashes, and cover data from suite-generated context. Engine/mod console text can still contain technical paths or gameplay state, so inspect it before sharing. Rotation occurs only before a new session once the active file reaches 8 MiB, preserving the complete failing session plus the previous trace.
- Preserves the first unhandled Lua traceback before upstream error-log filesystem work, reports it with `[native-lua-error]`, and mirrors only exact `lua-error.log` / `lua-error.log.1` through the existing bounded transactional save bridge. This prevents a missing optional diagnostic file from masking the real failure while keeping the same TXT/JSON/JSONL/CSV export path.
- Treats Davidobot’s generic post-ready Emscripten alert as an ambiguous diagnostic rather than a fatal signal because Lua `pcall` can catch the originating LÖVE exception. The complete preceding console/error sequence remains logged. Genuine `Module.onAbort`, `onExit`, uncaught `window.error`, unhandled rejection, WebGL terminal handling, and user close paths remain fatal/close-capable.
- Offers Balanced, Efficient, and Mod-default visual profiles. A profile seeds only catalog-managed settings that have no explicit native/in-game choice; explicit choices win. Choosing a different profile clears explicit values only for its managed keys, and a per-mod default reset suppresses profile values for that mod until a profile is deliberately chosen again. Original mod code is never edited.
- Measures average FPS, slow-frame percentage, worst frame interval, active Wasm heap, optional WebKit JS heap, Lua heap, and LÖVE draw/batch/canvas-switch/object/texture statistics in bounded ten-second windows. The native Settings card stores only the latest three frame fields; detailed measurements stay in the existing bounded local diagnostics journal.
- Mirrors saves every 10, 15, 30, or 60 seconds according to Settings. Periodic passes compare a sorted path/size/mtime inventory before reading or Base64-encoding save bytes; unchanged snapshots are skipped, while synchronized final snapshots still collect and submit every allowed save file.
- Provides an opt-in Update Center for a digest-verified Gen1Recomp engine update, all compatible mod updates, runtime-source awareness, and manually imported hash-declared no-pthreads LÖVE runtime bundles. Checks never install anything automatically.
- Keeps official release checks/downloads explicit and verifies a downloaded IPA against GitHub’s published SHA-256 digest.

## Supported ROM identities

| Game | SHA-1 | Gen1Recomp status |
|---|---|---|
| Pokémon Red | `ea9bcae617fdf159b045185467ae58b2e4a48b9a` | Supported |
| Pokémon Blue | `d7037c83e1ae5b39bde3c30787637ba1d4c48ce2` | Supported |
| Pokémon Yellow | `cc7d03262ebfaf2f06772c1a480c7d9d5f4a38e1` | Supported |
| Pokémon Gold | `d8b8a3600a465308c9953dfa04f0081c05bdcb94` | Beta / incomplete |

A structurally valid but unknown ROM is rejected. An unsupported record migrated from suite 2.x remains exportable/deletable but cannot be launched; there is no emulator fallback.

## Install

1. Transfer `Gen1Recomp Native Suite v3.6.0.scripting` to the iPhone/iPad.
2. Open it with **Scripting** and import the project.
3. Open **Gen1Recomp Native Suite** inside Scripting.
4. Tap **Import games** and select one or more ROM dumps you are legally entitled to use.
5. Tap a game cover, then **Play in Gen1Recomp**.
6. Keep the player open while the first local extraction runs. Direct-file desktop testing completed in roughly 11–20 seconds; an iPhone may differ.
7. If any runtime alert or failure appears, close the player, open **Settings → Console diagnostics → Export console diagnostics**, select **Readable complete log (.txt)**, and share that file for diagnosis. JSON, raw JSONL, and CSV are also available.

The project uses a finite Scripting page lifecycle: `Navigation.present(...)` is awaited, then `Script.exit()` runs after the page closes. Each player session owns and cleans up its WebView and temporary local runtime directory.

## Serverless player architecture

At launch, `modules/player.ts`:

1. asynchronously reads and SHA-256-verifies the active 14-file execution layer, separate immutable upstream core, matching love.js/WASM pair, selected ROM, mirrored saves, and integrity-checked mod packages;
2. builds exact byte-range metadata over the existing `Data` parts without calling `Data.combine(parts)`;
3. writes a small metadata-only `launch.js`, then serially writes ordered local chunk scripts of at most 1 MiB each using `Data.slice()` and asynchronous `FileManager.writeAsString()`;
4. copies local HTML, CSS, `binary-transport.js`, love.js, and the direct package loader into one fixed temporary directory;
5. commits an atomic Documents-side recovery marker and calls `WebViewController.loadFile(index.html, runtimeDirectory)`;
6. has `binary-transport.js` allocate exactly one WASM and one package `Uint8Array`, validate every chunk’s kind/index/offset/decoded length, decode directly into the destination, remove each executed script node, and release the transport’s reference when the consumer calls `take()`;
7. supplies `Module.wasmBinary` before love.js starts and hands package bytes to the existing Emscripten packager without `fetch` or XHR; a legacy monolithic envelope remains read-only fallback code but 3.6.0 never generates it;
8. starts LÖVE from the layer `/game.love`; layer `conf.lua` re-hashes `/gen1recomp-core.love`, mounts its `FileData` appended behind the source layer, keeps the save identity appended, verifies no critical module resolves from writable storage, then enters the compatibility-wrapped core main;
9. permits only file-local/browser-internal request schemes and rejects HTTP/HTTPS in the runtime WebView;
10. registers native handlers before page load for complete diagnostics, runtime status, save snapshots, and explicit player close requests;
11. returns to the dashboard on runtime exit/abort, uncaught browser/promise failure, explicit close, or fatal-panel close; a post-ready generic alert remains diagnostic because Lua `pcall` may have caught its source;
12. disposes the WebView, asynchronously deletes the entire ROM-bearing temporary directory, and clears the recovery marker. If iOS kills Scripting first, the next launch detects the marker/directory and removes them before rebuilding.

The loader deliberately bypasses Emscripten’s package IndexedDB cache, so the combined ROM/mod package is not stored there. Before injection it removes the previous browser-side mod tree, preventing a deleted or updated mod from surviving as a stale IDBFS copy. Gen1Recomp’s own extracted cache and working saves can use IDBFS. The native save mirror is restored on each launch and does not depend on the derived cache surviving.

See `ARCHITECTURE.md` for the complete data flow and patch inventory.

## Mod manager

Open the dedicated bottom **Mods** tab to:

- import one or more installable Gen1Recomp `.zip`/`.modpkg` packages from Files, with visible scan/verification/packing progress;
- paste a GitHub repository or exact release URL for a repository-bound, digest-gated install;
- inspect name, version, engine range, dependencies, conflicts, size, storage shape, and declared permissions;
- enable or disable each installed mod for the next game launch;
- open **Mod settings** to edit every captured toggle, choice, number, and text row exposed by Gen1Recomp for that installed version;
- restore one mod’s genuine declared defaults without changing its files or unrelated options;
- see whether a schema came from literal data-only import or the genuine runtime, and receive explicit first-launch discovery guidance instead of unsafe dashboard execution;
- remove a mod without deleting game saves;
- explicitly check a manifest-declared GitHub repository for an update;
- download an update only after confirmation and only when GitHub publishes a usable SHA-256 digest;
- install/update the external **Dramatic Shape Voxel Mod** from `scottcandy34/DramaticShapeVoxelMod-latest` on demand.

Installed mods also appear in genuine Gen1Recomp under **START → MODS**. In-game toggles are written to `native_mod_state.json`, returned through the existing save bridge, and reflected in the native menu after the player closes. Content changes apply on the next launch because Gen1Recomp freezes content registries at boot.

### Native mod settings

Gen1Recomp’s supported auto-UI contract has four row types: `toggle`, `choice`, `number`, and `text`. Version 3.2.8 and later store a normalized schema with the installed mod version and only primitive boolean/number/string values. The native editor validates choice membership, number ranges, text lengths, IDs/keys, row/choice counts, total state size, and finite numbers before saving. It never imports callbacks, functions, paths, or arbitrary tables into the native UI.

Discovery is deliberately split:

1. If a manifest names `options_schema`, import attempts to parse it as exactly `return <literal table>`. Comments, strings, finite numbers, booleans, nil, and nested literal tables are accepted within bounds. Any local variable, function/call, expression, metatable, duplicate/reserved key, or trailing statement causes native discovery to decline the file without executing it; installation itself can still proceed.
2. After an enabled mod loads, patched genuine Gen1Recomp reads the actual `loader.optionSchemas` table. It also follows Gen1Recomp’s own lazy manifest-schema path inside the game sandbox. A normalized maximum of 128 rows and 128 choices per row is written to `native_mod_options.json`, marked with the exact mod version, and returned by periodic/final snapshots. A dynamic mod therefore shows a clear “launch once” message until the genuine engine has safely captured it.

At boot, known schema keys are cleared from stale `options.lua`, profile values are applied first, and explicit native/in-game values are applied last. Existing non-profile values migrate once when their genuine schema becomes known. `SaveData.saveOptions` observes later persisted changes after its verified write, so Gen1Recomp’s START → MODS editor and custom mod menus that use the normal save path update the native mirror too. **Restore genuine defaults** removes explicit values and suppresses a visual preset for that mod, forcing the next boot to use the defaults in the currently installed mod. Selecting a performance profile again deliberately re-enables its catalog-managed keys.

Exact release-source audit found 18 literal rows in Wilds of Kanto 1.12.2, 10 dynamic rows in Kanto Life 0.6.1, 45 dynamic rows in Kanto Ascendant 6.0.11, and 14 live setting-ladder rows in Dramatic Shape 1.8.2. These counts are research fixtures, not hardcoded UI catalogs; updates are re-discovered by version.

### Import safety

Mods are executable Lua code. The importer reduces packaging risk but cannot prove arbitrary code is trustworthy. It:

- parses ZIP central/local records itself and rejects absolute paths, `..`, duplicate/case-colliding paths, overlaps, symlinks, encryption, ZIP64/multi-disk archives, unsupported compression, unsafe manifests/APIs, and ROM/save/state/IPA payload extensions;
- recognizes the package `manifest.json` only at the ZIP root or exactly one wrapper directory below it; deeper asset manifests are permitted and cannot be mistaken for the package manifest;
- independently caps a ZIP at 64 MiB compressed, 40,000 ZIP entries, 32,768 regular files, 128 MiB extracted, and 32 MiB per file; the complete installed runtime set remains bounded at 49,152 files and 128 MiB;
- inflates stored/DEFLATE entries locally in bounded cooperative batches, verifies every CRC-32, preserves verified compressed payloads in a normalized `package.zip`, and atomically replaces an existing mod only after validation and user confirmation;
- requires API-2 permissions to use Gen1Recomp’s known vocabulary;
- keeps network checks explicit and restricted to the selected GitHub repository’s API/release paths.

Dramatic Shape is **not bundled**. Its repository says redistribution of later code is restricted, so the suite downloads the author/fork release directly only after the user confirms. Public v1.8.2 (`DRAMATIC_SHAPE-1.8.2.zip`, SHA-256 `31a6a4e810610d540b830d411b6c47272407e9254b2969171aca780fcbe874f2`) was tested privately with canonical Yellow: Gen1Recomp logged `loaded mod DRAMATIC_SHAPE 1.8.2`, reached `REDS_HOUSE_2F`, and rendered a visible voxel-lighting view at 390×844. The mod’s optional Pokémon Stadium model path is not supplied; no Stadium ROM is bundled or accepted as a mod payload.

The compatibility `.love` adds narrow Web-only support needed by real API-2 mods: Lua 5.2-style string `load`, wrapped standard-Lua `loadstring` for legitimate self-loaded modules, UTF-8 BOM stripping, LuaJIT integer-suffix normalization for dormant FFI/VR modules, missing optional-file guards, an early rejection of unsupported readable depth canvases so a mod can use its internal fallback, and the exact Wilds ImageData format check described below.

Large-import and runtime regression testing used the exact public **Wilds of Kanto v1.12.2** release (SHA-256 `7272a62c7d72f069295281835c0a6cdbaccd2bcf0c24b2b8284c90b9d68a8e3b`). The suite CRC-checked all 11,921 files / 15,860,867 logical bytes and packed the mod successfully. The user’s complete 3.2.5 iPhone log then exposed a later GPU-format issue that a clean-load test had not reached: WebKit returned valid `rgba4` ImageData from Wilds’ optional 16×16 Canvas bake, but official LÖVE 11.5’s PNG handler accepts only `rgba8`/`rgba16`. Two Wilds-active sessions produced the encoder message, generic alert, and `map.entered`/`save.loaded` errors; the otherwise equivalent Wilds-inactive session succeeded. Version 3.2.6 inserts one exact compile-time format guard, lets Wilds take its existing `nil` bake fallback, and leaves its archive untouched. Chromium 140 first reproduced the old alert with a forced `rgba4` Canvas, then loaded exact Wilds, forced the same format under the rebuilt engine, reached genuine 390×844 gameplay, and reported no alert, Wilds error, close request, page error, dialog, or network request. The user’s subsequent 3.2.6 iPhone trace now confirms that guard under WKWebView: the marker executed, Route 2 loaded, Wilds spawned normally, and two battles completed without the old encoder error. A later unrelated Lua failure was masked by Gen1Recomp’s first-use `lua-error.log` read; 3.2.7 fixes that diagnostics path so the next TXT export contains the originating traceback. The archive is not bundled. The exact reported Stadium 2 Overworld Models v0.1.86 ZIP was unavailable, so that package remains an explicit device/import check rather than a claimed result.

The exact public **Kanto Ascendant v6.0.11** ZIP (16,662,061 bytes, SHA-256 `72779b0a9923e2e3908573552858718aa09bc6eae25222d1268bf3f1e41b62e7`) exposed a different Web-only failure: compatibility PhysFS could log a missing first-run `save/mod-derived/trainer_rematch/.stamp` read without returning to Lua, so the game never reached its loaded marker. The guarded stamp probe fixes that stall. The actual async preparer verified 10,780 files / 17,743,467 bytes and produced a single 16,662,061-byte normalized package. In a fresh 390×844 direct-file run, genuine Gen1Recomp mounted it, logged `loaded mod trainer_rematch 6.0.11`, reached gameplay in 13.923 seconds, generated 302 derived images cooperatively by 20.321 seconds, and reached 3.495-second cached gameplay without rerunning the transform. No mod or ROM is bundled.

The exact public **Kanto Life 0.6.1** release uses three `goto`/terminal-label loops that desktop LuaJIT accepts but love.js’s PUC Lua 5.1 parser rejects, including the reported line 303. The Web compatibility gate recognizes only that constrained continue shape and translates it in memory to an equivalent `repeat … until true` block. It refuses regions with arbitrary goto flow, nested loops, `repeat`, functions, or an existing `break`, and no-op passes preserve ordinary source bytes exactly, including CRLF and final-newline state. The actual importer verified three files / 48,495 logical bytes and emitted one 12,796-byte normalized package without changing the Lua payload. Fresh Chromium mounted that package, reported three rewritten loops, loaded `kanto_life 0.6.1`, and reached gameplay in 15.733 seconds without a page error or network request. The release is not bundled, and real-device confirmation remains required.

The supplied complete **PotatoVoxel v1.4.4** device export contains 6,809 lines / 2,262 events and shows two continuous failure loops rather than a texture-only problem: 262 identical `Invalid vertex map value: 0` failures and 549 actor-decal aborts while FPS degraded to 3.79 and memory grew. Revision 9 does not globally renumber mesh maps because LÖVE Data-form maps are correctly zero-based. It rewrites only the exact `SpriteBillboards.buildShadowBlob` Lua-table map, retires only broken `OverworldBattle` sessions after retaining the first traceback, and quarantines only the actor-decal pass after its first failure. The official release ZIP is pinned at SHA-256 `f9bedd5c1ed1074427fb5a6e3d5acac501f0cc0fba7be3c5516d12abecbb2c64`; all three transformed files compile under official PUC Lua 5.1.5, and the same sources under alternate mod paths remain unchanged. This is automated source/compile evidence, not a claim that the iPhone frame-rate degradation is already eliminated.

## Independent execution-layer updates

The Chrome-inspired layer is an executable component, not a patch list and not a reconstructed core. The unchanged selected Gen1Recomp `.love` remains a separate host-owned input; layer `conf.lua` verifies its exact size/SHA-256, mounts it behind the layer, and layer `main.lua` enforces critical-module precedence before entering it. Compatibility, stability, performance, diagnostics, recovery, bridge, and security fixes can therefore be released in a newer small layer without modifying or rebuilding the core.

**Settings → Update Center → Import execution-layer update** accepts a trusted `.love` layer. Before activation it requires:

- a strictly newer layer version and revision-9/suite contract;
- exact compatibility with the currently selected immutable core version, byte count, and SHA-256;
- deterministic source-layer output with safe, unique paths;
- every protected target, including the layer-owned updater policy; and
- an exact SHA-256 and byte count for every declared executable file.

The archive is staged, the prior layer is backed up, state is committed only after replacement, and the installed result is read and hashed again. Failure restores the previous layer/state. A missing, corrupt, or wrong-core override is ignored rather than partially combined; **Restore generated execution layer** removes it without touching the core, games, saves, or mods.

A local layer contains executable Lua and is therefore an explicit trust action. Scripting’s documented free Crypto API provides hashes, HMAC, and AES-GCM but no asymmetric signature verifier, and this release does not control a signed layer feed. Consequently 3.6.0 does **not** call an arbitrary downloaded layer “trusted” merely because its self-declared hashes match. Automatic remote layer installation is omitted until a publisher-signature boundary can be implemented and operated honestly. This differs from Chrome’s signed CRX delivery while retaining the useful component principles: independent versions/cadence, exact compatibility registration, verified installation, on-demand activation, sane absence/corruption fallback, and a bundled known-good implementation.

## Runtime bundle import

The suite intentionally has no automatic love.js/WASM binary feed: no reviewed upstream currently establishes a drop-in, licensed, no-pthreads pair for this patched file-only host. **Settings → Update Center → Import runtime bundle** accepts a ZIP with root-level `runtime-manifest.json`, `love.js`, and `love.wasm` (optional `LICENSE.txt`):

```json
{
  "schema": 1,
  "id": "love-web",
  "version": "11.5-custom.1",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "files": {
    "love.js": "<64 lowercase/uppercase hex SHA-256 of input love.js>",
    "love.wasm": "<64 lowercase/uppercase hex SHA-256 of love.wasm>"
  }
}
```

For a reviewed local pair, `tools/build_runtime_bundle.py --js … --wasm … --version … --commit … --output runtime.zip` creates this deterministic structure and rejects obvious incompatible inputs; it never downloads or licenses a runtime for you.

The entire ZIP and expanded content are capped at 32 MiB. The importer verifies both hashes, WebAssembly magic/version, the compatibility filesystem export anchor, and absence of pthread/`SharedArrayBuffer` markers. It may add the required `Module.FS` export to input JavaScript after hash verification. JavaScript, WASM, and component state are installed as one transaction with backups; they cannot be activated independently. Runtime code is executable—import only a pair whose source and license you trust.

## Storage and deletion

Local Documents layout:

```text
Gen1Recomp Native Suite/
├── Library/<game-id>/game.gb[c]
├── Library/<game-id>/custom-cover.*        (optional)
├── Gen1Recomp Saves/                       (native save/mod-state/mod-option mirror)
├── Mods/<mod-id>/package.zip              (new validated packed mods; legacy expanded installs remain readable)
├── Runtime Components/                     (optional verified layer/core and coupled Web-runtime overrides)
├── runtime-recovery.json                    (small atomic interrupted-launch marker; absent after a clean close)
├── Download Manager/
│   ├── downloads.json                      (sanitized queue metadata)
│   ├── downloads.tmp.json                  (fixed transaction staging file)
│   ├── downloads.backup.json               (fixed crash-recovery file)
│   └── Partials/*.part                     (untrusted resumable bytes)
├── mods.json / mods.backup.json            (mod metadata and enabled profile)
├── settings.json / settings.backup.json    (profiles, timing, check opt-in, latest metric)
├── Official Downloads/                     (only after explicit verified handoff)
├── library.json
└── library.backup.json
```

WebKit separately stores Gen1Recomp’s extracted cache and working filesystem data. Scripting does not expose an API here to list or purge all of that WebKit website data; removing Scripting’s website data may be necessary for a complete WebKit-cache reset. The host-controlled native save mirror remains separately visible in Documents.

Removing a library game is deliberately two-stage:

- **Remove ROM · keep saves** removes the ROM/cover but retains that game version’s mirrored saves.
- **Remove ROM & saves** also removes that version’s mirrored save directory and legacy save files. Shared `options.lua` settings remain.

## Network and privacy

Normal ROM/mod/layer/runtime import, library use, game launch, cache extraction, controls, saves, covers, diagnostics creation, and export-file creation are local. The runtime receives only local package bytes and has no network permission. A document-provider or share-sheet destination chosen by the user is outside the suite's control after explicit handoff.

External network access occurs only after an explicit action, or after the user enables **Automatic update checks** in Settings:

- checks `https://api.github.com/repos/bryanthaboi/gen1recomp/releases/latest` for a compatible engine/release;
- checks the pinned Davidobot/love.js branch commit for source-change awareness;
- downloads a selected official GitHub release asset;
- checks/downloads a user-selected mod’s declared GitHub release or the explicit Dramatic Shape shortcut; or
- opens official release notes/source pages in Safari.

The runtime CSP is `connect-src 'none'`, and its request policy rejects HTTP/HTTPS. There is no remote analytics or telemetry. Performance/runtime telemetry and component state remain local. Persistent console traces are ordinary bounded local files under the suite’s Diagnostics directory; they intentionally contain detailed versions, enabled mod IDs/names, component/download events, stack traces, capability and performance fields needed for diagnosis, but the native diagnostic context excludes ROM filenames, SHA-1, contents, and custom-cover data. Only the explicit Settings export opens the iOS options menu; the temporary export copy is deleted afterward. Users should still inspect a readable `.txt` before sharing because mod-originated error text can contain mod-defined values.

## Validation status and device limitations

The unchanged genuine runtime lineage was exercised through direct `file://` Chromium runs with a private canonical Yellow fixture. Tests covered complete import, visible runtime startup, native injection, a 390×844 canvas, cached relaunch, byte-identical save restore/snapshot bridging, native mod-state enable/disable behavior, stale-mod removal, and public Dramatic Shape v1.8.2 reaching visible voxel gameplay. The 3.2.0 baseline also proved exact Balanced options through a synthetic genuine API-2 mod, bounded ten-second telemetry delivery, and same-origin Mod-default reset on cached relaunch. The private fixture, synthetic harness, browser profile, and in-memory captures are not included.

The user confirmed finalized 3.2.0 broadly on-device, confirmed that 3.2.3 exposed packed mods in Gen1Recomp, supplied genuine 3.2.5/3.2.6/3.2.9 traces that drove the console, Wilds, option, and caught-alert fixes, and confirmed the finished 3.3.0 release works on-device. The newest genuine target-device evidence is the supplied 479,871-byte 3.4.0 TXT export from iPhone 16 Pro Max / iOS 26.6 with installed Gen1Recomp 0.1.81 and PotatoVoxel 1.4.4. It contains 6,809 lines / 2,262 events, preserves continuous frame/Lua/Wasm/graphics/save/mod diagnostics, and directly motivated 3.6.0. The trace proves worsening frame time correlates with continuous PotatoVoxel failure/retry activity and memory growth; stable texture memory rejects a texture-only explanation, while the exact retained-Lua source remains unproven. Exact public PotatoVoxel source/PUC-Lua regressions now cover the three narrow revision-9 rewrites, but only a new target-device run can establish their gameplay and frame-time effect.

Automated evidence additionally covers streamed persistent partials, connection-loss Range resume, `If-Range`, ignored-Range clean restart, malformed and mismatched `206` rejection, retries, active and queued pause/cancel, cancelled-ID reuse, completed discard, wrong size/hash rejection, process-reload reconciliation, corrupt-primary backup recovery, interrupted queue-commit rollback, TypeScript validation, deterministic layer rebuild, PUC-Lua bridge/updater behavior, independent layer import/core-binding/per-file-hash/monotonic/rollback/fallback checks, exact revision-8-to-9 migration rollback, enabled-only mod packaging and re-enablement, ordered asynchronous diagnostic batching/fallback/export durability, unchanged periodic-save suppression, official PotatoVoxel archive rewrites/PUC-Lua compilation, exact newer-engine layer generation, archive integrity, and static native UI structure. Chromium also proved that injected writable updater `Boot.lua`/pending/archive content neither executes nor survives layer cleanup. These are not claims that iOS kept running after process termination or that the new UI/device paths are already target-qualified.

The remaining broader surfaces also require the target-device checklist:

- 3.6.0 import, revision-8 migration, exact PotatoVoxel map/battle/decal behavior, sustained walking/battle frame times and memory, diagnostic/save bridge reductions, disabled-mod launch-byte reduction, and free-tier behavior on the target device; plus the inherited worker-backed large-mod path, forced-termination cleanup, chunked startup, all 12 native settings/edit/reset/write-back paths, poor-Wi-Fi download controls, and in-content Back/Close taps;
- `WebViewController.loadFile()` behavior and file-origin IndexedDB persistence in WKWebView;
- real WebKit peak-memory reduction from bounded chunk decoding on older devices; automated tests prove exact reconstruction/order/release invariants, not iOS process memory;
- iOS GPU compatibility and performance for individual visual mods such as Dramatic Shape;
- performance and memory behavior of the self-contained TypeScript ZIP/DEFLATE path on the oldest intended iPhone/iPad;
- WebAudio after iOS user activation (love.js documents compatibility-mode audio as imperfect);
- native snapshot file writing and final-save timing under suspension/dismissal;
- document-provider import/export behavior;
- real-device portrait/landscape rotation, safe areas, Dynamic Type, VoiceOver, and Reduce Motion.

Follow `DEVICE_TEST_CHECKLIST.md` before treating a target device as qualified.

## Project map

- `index.tsx` — bilingual full-screen four-tab native UI, close actions, mod health, persistent-console summary/export/clear controls, Settings, Update Center, and safe actions.
- `modules/downloads.ts` — persistent streamed partials, fixed-file transactional queue recovery, validated HTTP Range resume, retry/backoff, pause/cancel/resume, progress observation, and exact size/SHA-256 promotion gates.
- `modules/diagnostics.ts` — ordered asynchronous diagnostic batching with complete-batch fallback and durability flushes, append-only native/Web journal, chunk-preserving readers, pre-session rotation, summaries, and temporary TXT/JSON/JSONL/CSV exports.
- `modules/localization.ts` — centralized English/German strings and language selection.
- `modules/config.ts` + `config/catalog.json` — validated component registry, pinned runtime identity, featured-mod sources, and performance presets.
- `modules/settings.ts` — recovered local preferences, check schedule, save timing, and bounded performance metric.
- `modules/components.ts` — async/sync layer/core verification, transactional revision-8-to-9 migration, complete-pair bundled fallback, immutable installed-source retention, revision-9 capability gating, monotonic verified core updates, coupled runtime-bundle import, and rollback.
- `modules/engine-patcher.ts` — guarded deterministic builder for the small executable source layer; it reads approved core targets but never reconstructs or edits the upstream archive.
- `modules/library.ts` — metadata migration, ROM import, covers, export, deletion.
- `modules/player.ts` — serverless chunked local-file injection, async component/ROM/save/mod reads, WebView, cleanup, capability telemetry, and save bridge.
- `modules/runtime-recovery.ts` — atomic persistent marker ownership and next-launch cleanup for an interrupted private runtime.
- `modules/mods.ts` — bounded background ZIP parsing/CRC/DEFLATE/repacking, async I/O, compressed-payload-preserving installs, schema extraction, legacy compatibility, GitHub installs, and enabled-only runtime payload enumeration with a complete installed-state mirror.
- `modules/mod-options.ts` — bounded literal-Lua data parser plus atomic schema-2 native option state, profile/explicit precedence, in-game write-back reconciliation, and genuine-default reset semantics.
- `modules/mod-limits.ts` — independent ZIP-entry, archive-file, installed-file, byte, and manifest ceilings shared by the importer.
- `modules/mod-validation.ts` — pure manifest, path, repository, payload, and version validation.
- `modules/zip.ts` — self-contained free-tier ZIP reader, raw-DEFLATE inflater, CRC-32 verifier, stored-ZIP writer, and compressed-payload-preserving repack writer; no host archive API.
- `modules/rom.ts` — strict header validation and canonical identities.
- `modules/releases.ts` — explicit GitHub release check and verified IPA download.
- `config/compatibility-pack.json` — schema-2 revision-9 execution contract: separate layer/core digests, precedence, compatibility, safe-failure/rollback policy, and exact effective targets.
- `runtime/` — immutable official Gen1Recomp core, 14-file separately versioned executable layer, bounded binary transport, LÖVE WebAssembly runtime, local shell, and licenses.
- `runtime/patches/bit.lua` — pure-Lua BitOp-compatible subset for standard Lua 5.1.
- `tools/build_web_love.py` — deterministic patcher for the verified official `.love`.
- `tools/build_runtime_bundle.py` — deterministic manifest/ZIP builder for a separately reviewed no-pthreads JS/WASM pair; performs no download.
- `tools/validate_project.py` — deterministic structure, integrity, free-tier, privacy, and patch checks.
- `tools/test_rom.ts` — synthetic header/checksum unit tests and canonical identity lookup; it reads no private ROM.
- `tools/test_mods.ts` — pure mod manifest/path/repository/version safety tests.
- `tools/test_mod_options.ts` — literal-schema parser and native state/profile/reset regressions under a documented-host filesystem shim.
- `tools/test_mod_option_bridge.py` — persistent official-PUC-Lua-5.1 schema/default/migration/write-back bridge regression.
- `tools/test_zip.mjs` — stored/fixed/dynamic/uncompressed DEFLATE, CRC, repack, encoding, symlink/encryption, corruption, and public Dramatic Shape ZIP tests.
- `tools/test_engine_update.mjs` — reproduces the on-device patch from an official `.love` and checks the resulting archive structure.
- `tools/test_binary_transport.mjs` — reconstructs exact chunks and rejects reordering, incomplete/reused consumers, size mismatches, and nonlocal script names.
- `tools/test_mod_preparation.ts` — executes production worker stages through the host shim and verifies progress plus normalized package byte identity.
- `tools/test_runtime_recovery.ts` — exercises journal ownership, interrupted-directory cleanup, and malformed-marker recovery.
- `tools/test_compatibility_pack.py` — proves that all 453 immutable core entries remain exact outside the eleven declared compatibility targets.
- `tools/test_wilds_compat.py` — with the external exact public Wilds ZIP and official PUC Lua 5.1 executable, verifies the path-scoped source guard, idempotence, `rgba4` fallback, and unchanged `rgba8` encode path.
- `tools/test_lua_error_diagnostics.py` — executes the isolated bundled diagnostics module under official PUC Lua 5.1 and verifies absent-first-log handling, append, rotation, and redaction.
- `tools/test_potato_voxel_compat.py` — extracts the exact official PotatoVoxel v1.4.4 sources, applies the bundled revision-9 path/source guards, verifies alternate-path identity, and compiles all transformed files with official PUC Lua 5.1.5.
- `tools/test_execution_layer_migration.ts` — covers revision-8 migration success, transactional rollback, exact old-state preservation, and complete bundled-pair fallback.
- `tools/test_mod_packaging.ts` — proves disabled payload bytes are absent, the complete enablement state survives, and native re-enablement selects the payload on the next launch.
- `tools/test_diagnostic_batching.ts` and `tools/test_runtime_performance_guards.py` — cover ordered asynchronous batching/fallback/export durability plus bridge-count, periodic-save, and enabled-mod static contracts.

## Legal

Gen1Recomp is unofficial fan software and is not affiliated with Nintendo, The Pokémon Company, GAME FREAK, or Creatures. Pokémon names and artwork belong to their respective owners. Supply only ROM dumps you are legally entitled to use. Do not redistribute ROM data.

See `THIRD_PARTY_NOTICES.md`, `SOURCES.md`, and the retained license files.
