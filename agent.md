# agent.md — Agent instructions for the Gen1Recomp Native Suite

This file follows the AGENTS.md convention: it tells AI coding agents what this repository is, what they must never do, and how work is verified. Read it fully before changing anything. Load `skills.md` for the Scripting App development skill and its project addendum.

## What this repository is

A distributable project for the **Scripting** iOS/iPadOS app (developer: Shenzhen Yin Shi Technology, official site `https://scripting.fun`, docs `https://scriptingapp.github.io`). The project, **Gen1Recomp Native Suite**, runs the genuine Gen1Recomp Lua/LÖVE Pokémon Gen-1 recreation locally inside a file-only `WKWebView` via `WebViewController.loadFile()`, with user-supplied ROMs, a mod manager, resumable verified downloads, and local diagnostics. The distributable is a `.scripting` ZIP (this directory tree zipped) imported into the Scripting app.

## Non-negotiable constraints

1. **Free tier only.** No Scripting PRO APIs anywhere (Health, HomeKit, AVCaptureSession capture APIs, Spotlight indexing, Safari redirect rules/search shortcuts, widget `openApp`, alarm capabilities gated by PRO, anything behind `Script.hasFullAccess()`). If a feature needs PRO, implement an equivalent with free-tier APIs or decline. Never introduce a PRO dependency "temporarily".
2. **Serverless.** No `HttpServer`, no TCP listeners, no `127.0.0.1`/`localhost`, no runtime network access from the player WebView (CSP stays `connect-src 'none'`; `shouldAllowRequest` permits only `file:`/`blob:`/`data:`/`about:blank`).
3. **Privacy.** No ROM bytes, save contents, ROM filenames/hashes, or cover data in logs, docs, or diagnostics exports beyond the existing redaction rules. Keep everything local-first; network only after explicit user action (or the opt-in update check).
4. **No bundled third-party mods or ROMs.** Dramatic Shape, Wilds of Kanto, Kanto Ascendant, Kanto Life are referenced by public source only; archives stay external.
5. **Docs before code.** Before using any Scripting API symbol, confirm it in the official documentation (`https://scriptingapp.github.io/llms.txt` → exact topic page). Do not invent APIs from memory. Record what you checked.
6. **Evidence discipline.** Desktop tests ≠ device proof. Never describe compilation, preview, or simulated runs as on-device verification; name the remaining device steps instead.

## Working agreement

- Make the narrowest compatible change; preserve naming, metadata, lifecycle (`Navigation.present` → `Script.exit()`), and user configuration unless the task requires otherwise.
- Keep the bilingual UI: every new user-facing string goes into `modules/localization.ts` in EN and DE.
- Keep limits bounded (see `modules/mod-limits.ts`); no unbounded loops, buffers, or retries.
- Append-only diagnostics: use the existing `recordDiagnostic` / `recordDiagnosticError` plumbing; keep event names stable where tooling/log analysis depends on them.
- The generated ROM-bearing `launch.js` is never bundled or committed; it only exists in the player's temporary directory.

## Verification commands (all must pass before completion)

Run from the project root. TypeScript tests need a runner that maps the `scripting` module to `tools/scripting-node-stub.ts` (e.g. `tsx --tsconfig <config with paths>`); Python tests need `python3`, and Lua bridge tests need an official PUC Lua 5.1 interpreter.

```bash
python3 tools/verify_instruction_lock.py          # agent.md/skills.md match locked SHA-256
python3 tools/validate_project.py                 # static structure/privacy/PRO-ban/manifest checks
tsc -p <strict tsconfig incl. host-shim>          # typecheck
tsx tools/test_downloads.ts                       # resumable download manager incl. stream-source precedence
tsx tools/test_zip.mjs                            # ZIP/DEFLATE/CRC/repack
tsx tools/test_rom.ts && tsx tools/test_mods.ts && tsx tools/test_mod_options.ts
python3 tools/test_runtime_alert_policy.py        # runtime alert policy (pure Python)
python3 tools/test_launch_chunks.py               # chunked Base64 launch contract (Python + Node)
python3 tools/test_lua_error_diagnostics.py <lua5.1>
python3 tools/test_mod_option_bridge.py --lua <lua5.1>
# external-input tests (require user-supplied artifacts, not bundled):
node tools/test_engine_update.mjs /path/to/official.love
python3 tools/test_wilds_compat.py --zip /path/to/WildsOfKanto.zip --lua <lua5.1>
```

After any byte change to distributable files: regenerate `MANIFEST.sha256` (every file exactly once, sha256, two-space separator), then re-run `validate_project.py`.

## Release packaging

- Bump `version` in `script.json`, prepend a `CHANGELOG.md` entry (evidence + limitations), update `README.md`/`ARCHITECTURE.md` claims only to what the evidence supports, and add device items to `DEVICE_TEST_CHECKLIST.md` for anything not device-proven.
- Zip the project directory (flat, no wrapper directory) to `Gen1Recomp Native Suite v<version>.scripting` and verify the ZIP opens with `zipfile.ZipFile.testzip()`.

## Provenance

Research sources (scripting.fun ecosystem) and the complete verification record live in `RESEARCH.md`, `SOURCES.md`, and `VALIDATION.md`. Keep them current when you do new research or change behavior.
