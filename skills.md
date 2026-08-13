---
name: gen1recomp-scripting-app-development
description: "Develop, modify, debug, and validate Scripting App projects: TypeScript/TSX scripts, iOS-style pages, native APIs, Widgets, Live Activities, rich notifications, Shortcuts/Share Sheet intents, App Intents, and Safari browser scripts. Uses Scripting's official llms.txt as the API reference entry point. Includes the free-tier-only policy and verification workflow of the Gen1Recomp Native Suite."
---

# Scripting App Development

Use this skill to help users create, change, debug, or validate **Scripting App** script projects. It is a technical development guide; it does not prescribe task planning, spec files, Git workflow, or a generic coding-agent process.

## Scope and routing

Use this skill for a Scripting project or any of these files/capabilities:

- `script.json`, `index.tsx`, shared `.ts` / `.tsx` modules, and SwiftUI-style TSX pages.
- `widget.tsx`, `app_intents.tsx`, `live_activity.tsx`, `notification.tsx`, and `intent.tsx`.
- `browser.tsx` or a separately installed Safari `.user.js` script.
- Desktop-editor live sync/debugging with `scripting-cli`.
- Scripting-provided iOS APIs such as Notification, Calendar, Location, Photos, Storage, Speech, and Device.
- Advanced entry points: Home Screen default UI, control widgets, custom keyboard, Spotlight, Translation UI, Assistant Tools, and Alarm Live Activities.

Do not use it as a substitute for creating a standalone Apple Shortcut, ordinary Node/Python automation, or a generic web app.

## Mandatory official-documentation workflow

Before writing or changing **any Scripting-specific API usage**, use the current environment's bundled Scripting reference/API declarations when available (for example, `scripting_reference`). For desktop agents without that tool, consult the official LLM documentation index:

```text
https://scriptingapp.github.io/llms.txt
```

1. Search the bundled docs first when available; otherwise search the public index for the exact API, entry point, or capability.
2. Read the full matching documentation and exact API declarations—not only a search-result summary.
3. Verify the symbols to be used: import/global module, parameters, result type, async behavior, iOS/version availability, permissions, host constraints, and official example patterns.
4. Implement only APIs confirmed by the current documentation. Do not infer an API from Swift, React, old examples, or model memory.
5. If a connected `scripting-cli` workspace is available, search its app-synced `.d.ts` declarations to confirm exact local TypeScript signatures/imports; use them with—not instead of—the official documentation's behavior, permission, and host constraints.

Read only the necessary topic reference below. If a local reference conflicts with current official documentation, the official documentation wins.

## Start work

### New project

1. Identify the requested host: finite script, in-app page, resident/resumable script, Widget, Live Activity, rich notification, Intent, Safari project script, or installed userscript.
2. Create a project directory with `script.json` and `index.tsx`; use the templates only as a starting point.
3. Add capability entry files **only** when requested.
4. Read `references/project-and-lifecycle.md`, then the matching capability reference.

### Existing project

1. Read `script.json`, `index.tsx`, the requested entry file, and its direct dependencies before modifying code.
2. Preserve the existing project naming, metadata, entry points, lifecycle, and user configuration unless the requested change requires otherwise.
3. Make the narrowest compatible change. Do not add unused capabilities or refactor unrelated files.

## Project rules

- A project requires `script.json` and `index.tsx`.
- `script.json` must include `name`, `icon`, `color`, and `version`; `name` normally matches the directory name.
- Keep shared business logic in regular modules; entry files should adapt that logic to their host environment.
- Use `async` / `await`, handle expected failure paths, and give the user meaningful feedback.
- For standalone `scripting-ts run` execution, make sure finite paths call `Script.exit()`; otherwise the process may wait indefinitely.
- TSX modifier order affects layout and appearance. When debugging UI, inspect the order of `frame`, `padding`, `background`, `clipShape`, `buttonStyle`, `contentMargins`, and `widgetBackground` as well as their values.
- Avoid unbounded vertical layouts inside `Grid` / `ScrollView`; validate image-heavy layouts on an actual render.

## Lifecycle decision

| Need | Design |
|---|---|
| Finite work is done | Call `Script.exit()`. |
| One-time page | `await Navigation.present(...)`, then `Script.exit()` after dismissal. |
| Preserve runtime state or respond to notification/widget/URL re-triggers | Use `Script.minimize()` and `Script.onResume(...)`; do not unconditionally exit. |
| Return from `intent.tsx` | Return an appropriate Intent result with `Script.exit(value)`. |

Read `references/project-and-lifecycle.md` before choosing or changing this behavior.

## Capability references

| User need | Read |
|---|---|
| Project structure, entry files, lifecycle | `references/project-and-lifecycle.md` |
| Standard in-app page | `references/ios-pages.md` |
| Static or interactive Widget / App Intent | `references/widgets-and-app-intents.md` |
| Live Activity / Dynamic Island | `references/live-activities.md` |
| Rich notification | `references/notifications-and-intents.md` |
| Shortcuts / Share Sheet | `references/notifications-and-intents.md` |
| Desktop editor ↔ Scripting App sync/debugging | `references/desktop-cli.md` |
| Native iOS API | `references/native-apis.md` plus official API page |
| Safari browser script / userscript | `references/safari-browser-scripts.md` |
| Keyboard, Home Screen UI, Spotlight, Translation UI, Assistant Tool, Alarm Live Activity | `references/additional-entry-points.md` plus exact bundled docs/API declaration |

## Validation requirements

Read `references/validation-and-security.md` and use the relevant checklist, including `checklists/desktop-live-debug.md` when setting up `scripting-cli`.

- For desktop live synchronization/debugging, read `references/desktop-cli.md`; initialize and run `scripting-cli` only after checking Node.js and confirming any first-time package download/configuration effects. After App connection, consult its synced `.d.ts` files whenever exact local API typings or component props are needed.
- Run static diagnostics for changed TypeScript/TSX where available.
- Run finite `index.tsx` code with `scripting-ts project "<name>"` or an equivalent environment command when possible.
- Preview Widget/UI surfaces when possible; test all target Widget families if layout differs by family.
- Be explicit about host-only verification: Widget must be added to the Home Screen; Intents require Shortcuts/Share Sheet; rich notifications require a real notification; Live Activities require the Lock Screen/Dynamic Island; Safari scripts require a matching Safari page.
- Never describe compilation, preview, `Widget.present()`, or a mock Intent as full system-host verification.

## Safety boundary

Before expanding privileges or causing external side effects, describe the impact and get the user's confirmation. This includes sensitive system permissions, reads/writes of user data, cross-origin requests/Cookies/downloads, sending or uploading data, and deleting or bulk-modifying data.

Never hard-code or expose API keys, passwords, tokens, Cookies, private keys, or private user data in source, `script.json`, logs, screenshots, or sample files. Apply minimum permissions and minimum data access.

## Completion response

Summarize only what matters:

1. files and behavior changed;
2. lifecycle choice, if relevant;
3. official documentation topics/API symbols checked;
4. diagnostics, run, or preview evidence;
5. exact remaining manual host verification steps;
6. permissions or side effects introduced.

---

# Gen1Recomp Native Suite project addendum

The sections above are the official `scripting-app-development` skill (ScriptingApp GitHub organization). The addendum below is project policy for this repository and binds every agent that works on the Gen1Recomp Native Suite.

## Free-tier-only policy (hard constraint)

This suite must run on the free Scripting App. Never use Scripting PRO-gated APIs; if a desired capability is PRO-only, implement an equivalent with free-tier means or decline the change.

Confirmed PRO-gated surfaces (official documentation, checked 2026-08-13 via `scriptingapp.github.io/llms.txt` and the App Store documentation bundle):

- `Health` APIs (Scripting PRO subscription).
- HomeKit APIs.
- `AVCaptureSession` `startRunning()` / `capturePhoto()` / `startRecording()`.
- Spotlight indexing.
- Safari redirect rules and Safari search shortcuts.
- Widget API `openApp` (opening another app by bundle ID).
- AlarmKit-based `alarms` capability and other PRO capabilities enforced at call time (see `script/permissions` docs).
- Any API that `Script.hasFullAccess()` gates.

The suite must also stay serverless: no `HttpServer`, no listening sockets, no localhost/loopback URLs. `WebViewController.loadFile(path, allowingReadAccessTo)` is the transport. `tools/validate_project.py` statically enforces these bans; keep it green.

## Verified free-tier API anchors for this project

Checked against the official documentation bundle (`Scripting Documentation.zip` from `ScriptingApp/ScriptingApp.github.io`):

- `WebViewController`: `loadFile`, `loadHTML`, `evaluateJavaScript` (result needs `return`), `addScriptMessageHandler`, `present({fullscreen, navigationTitle})`, `dismiss`, `dispose`, `shouldAllowRequest`.
- `fetch` Response: documented streaming surface is `body: ReadableStream<Data>` with `Data` chunks; `data(): Promise<Data>` is the bounded fallback. `expectedContentLength` and `headers.get(...)` are documented. Undocumented legacy names must only ever be secondary fallbacks.
- `FileManager`: `documentsDirectory`, `temporaryDirectory`, `existsSync`, `createDirectorySync`, `copyFileSync`, `readDirectorySync`, `isDirectorySync`, `statSync`, `renameSync`, `removeSync`, `readAsString/Sync`, `readAsData/Sync`, `writeAsString/Sync`, `writeAsData/Sync`, `appendData/Sync`.
- `Data`: `size`, `fromFile`, `fromRawString`, `fromBase64String`, `fromUint8Array`, `combine`, `toBase64String`, `toRawString`, `toUint8Array`, `toHexString`.
- `Crypto.sha256(Data)`, `Crypto.generateSymmetricKey(bits)`.
- Lifecycle: `Navigation.present(...)` awaited, then `Script.exit()` (finite one-time page model — this suite's model).

## Launch payload contract

The native side (`modules/player.ts`) writes chunked Base64 into `launch.js`:

- `wasmBase64Chunks: string[]`, `wasmBytes: number`
- `packageBase64Chunks: string[]`, `packageMetadata` (exact byte ranges), `runtimeOptions`

Chunks are ≤ 2^20 Base64 characters and always cut on 4-character boundaries. The browser side decodes with the single canonical `runtime/decode.js` helper (`window.Gen1DecodeBase64Chunks(chunks, expectedBytes)`), never one giant `atob`, to bound peak memory. Keep both sides of this contract synchronized and keep `tools/test_launch_chunks.py` green.

## Verification loop (run before declaring any change complete)

0. `python3 tools/verify_instruction_lock.py` — `agent.md` and `skills.md` must match their locked SHA-256 values; any intended change needs a digest update plus a CHANGELOG entry.
1. `python3 tools/validate_project.py` — 250+ static checks incl. PRO/server ban and manifest hashes.
2. `tsc` with the strict project config (host-shim typed subset).
3. `tsx tools/test_downloads.ts`, `tsx tools/test_zip.mjs`, `tsx tools/test_rom.ts`, `tsx tools/test_mods.ts`, `tsx tools/test_mod_options.ts` (map `scripting` → `tools/scripting-node-stub.ts`).
4. `python3 tools/test_runtime_alert_policy.py`, `python3 tools/test_launch_chunks.py`, and with a PUC Lua 5.1 interpreter: `tools/test_lua_error_diagnostics.py`, `tools/test_mod_option_bridge.py`.
5. Regenerate `MANIFEST.sha256` whenever any distributable byte changes, then re-run step 1.
6. State the exact remaining on-device verification (see `DEVICE_TEST_CHECKLIST.md`); never upgrade desktop evidence to device evidence.
