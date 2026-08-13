# RESEARCH.md — Tiefenrecherche Scripting-App / scripting.fun (Stand 2026-08-13)

Dieses Dokument protokolliert die vollständige Recherche, die den Verbesserungen von
Gen1Recomp Native Suite 3.4.0 vorausging: App-Identität, offizielle Dokumentation,
PRO-/Free-Tier-Grenzen, Beispiel-Scripte („scriptingfun" = `scripting.fun`) und die
Verifizierungsumgebung. Jede Aussage ist mit der konkreten Quelle belegt; alle
heruntergeladenen Referenzen liegen unter `.work/references/` (Klon-Stände unten).

## 1. Identität der App

- **„Scripting"** im App Store, ID `6479691128`, Entwickler **Shenzhen Yin Shi Technology Co., Ltd.** (App-Name im Store: „Scripting — Build & Run Scripts with AI", Free mit In-App-Käufen, 494,3 MB).
  Quelle: App-Store-Seite `https://apps.apple.com/us/app/scripting/id6479691128` (abgerufen 2026-08-13).
- Offizielle Website: **`https://scripting.fun`** (EN: `https://www.scripting.fun/en.html`, ZH: Startseite). Der in der Aufgabe genannte Name „scriptingfun" bezeichnet diese Domain — es existiert **kein** GitHub-User/Org „scriptingfun" (404 auf `https://github.com/scriptingfun`, 0 Web-Treffer auf den exakten Begriff).
- Die App positioniert sich als „AI Agent getriebene iOS-Automatisierung": TypeScript/TSX-Scripte, native APIs, Widgets, Control Center, Dynamic Island, Keyboards, Shortcuts, Share Sheet, Safari-Scripts, Node.js/npm (ab 3.2.0 Juli 2026), Python-Scripte (ab 3.1.0), CloudSharedData-API (3.2.0), AlarmManager (3.0.0), JWT (2.4.9), **AI-Funktionen „memory und skills" seit Version 3.1.0 (April 2025)** — letzteres ist der Grund, warum `skills.md`/`agent.md` in diesem Projekt sinnvoll sind.
  Quellen: App-Store-Versionshistorie (gleiche Seite), `https://www.scripting.fun/en.html`.
- Offizielle GitHub-Organisation: **`https://github.com/ScriptingApp`** (7 Repositories, Klon-Stände unten). Autor/ Maintainer laut Doku-Startseite: `thomfang`.

## 2. Offizielle Dokumentation und API-Verifikation

- Doku-Index für LLMs: **`https://scriptingapp.github.io/llms.txt`** (12 Seiten Umfang). Der offizielle Skill `scripting-app-development` schreibt vor, vor jeder API-Nutzung diesen Index und die exakte API-Seite zu lesen — dieses Projekt folgt dem (siehe `skills.md`).
- Das Doku-Repo `ScriptingApp/ScriptingApp.github.io` enthält die komplette Doku als ZIP: `scripting/App Store/Scripting Documentation.zip` (**1314 Einträge, 898 Dokumente**, entpackt unter `.work/doczip/`). Damit war eine vollständige Offline-Verifikation aller verwendeten APIs möglich.

### Verifizierte PRO-pflichtige Funktionen (harte Free-Tier-Grenze)

Direktzitate aus der offiziellen Doku (abgerufen 2026-08-13):

| Funktion | Quelle (Dokument) | Wortlaut |
|---|---|---|
| Safari Redirect Rules | `safari_redirect_rules/en.md` | „This feature requires Scripting PRO." |
| Safari Search Shortcuts | `safari_search_shortcuts/en.md` | „This feature requires Scripting PRO." |
| Spotlight-Indizierung | `spotlight/en.md` | „Spotlight indexing requires Scripting PRO." |
| Health-API | `health/request_multiple_permissions/en.md` | „`Health` APIs require a Scripting PRO subscription." |
| Kamera-Aufnahme | `av_capture_session/quick_start/en.md` | „PRO is required to call `startRunning()`, `capturePhoto()` and `startRecording()`." |
| Widget `openApp` | `widget_api/en.md` | „This API requires Scripting PRO." |
| PRO-Erkennung | `script/api/en.md` | `Script.hasFullAccess()` — „Determine whether user has full access to the Scripting PRO features." |
| Durchsetzung bei Aufruf | `script/permissions/en.md` | „Capabilities that require PRO (such as `alarms`, `health`, `homeKit`) are still enforced when the corresponding API is actually called." |
| Server-API | Projekt-Historie `SOURCES.md` (hiesig) | `HttpServer`/Server-APIs wurden nach einem Fehlschlag in 3.0.0 als PRO-pflichtig verworfen; seither serverlos. |

Folgerung für 3.4.0: Der Validator (`tools/validate_project.py`) verbietet jetzt zusätzlich statisch
`HomeKit`, `AVCaptureSession`, `AlarmManager`, `hasFullAccess(`, `Spotlight.index`,
`Health.querySteps`, `openApp(`, `safariRedirectRule`, `safariSearchShortcut`, `Assistant.request`
in jeder ausführbaren Quelle. Keiner dieser Tokens war vorher vorhanden (Scan verifiziert).

### API-Feststellungen mit Auswirkung auf den Code

1. **`fetch`/`Response`** (`request/en.md`): Die dokumentierte Streaming-Oberfläche ist
   `body: ReadableStream<Data>` (Chunks vom Typ `Data`), dazu `data(): Promise<Data>` als
   gebundene Variante, `expectedContentLength`, `headers`. **`dataStream` ist in der aktuellen
   offiziellen Doku nicht mehr dokumentiert** — die Suite nutzte es aber als Primärquelle.
   → 3.4.0 bevorzugt `body`, hält `dataStream` als Sekundär-Fallback und `data()` als
   letzte Stufe; `tools/test_downloads.ts` testet die Präzedenz.
2. **`WebViewController`** (`webview_controller/en.md`): `loadFile(path, allowingReadAccessTo)`,
   `evaluateJavaScript` (Ergebnis erfordert `return`), `addScriptMessageHandler` (Promise-Antwort),
   `present({fullscreen, navigationTitle})`, `shouldAllowRequest`, `dismiss/dispose`,
   `ephemeral`-Option, Cookies — alle von der Suite verwendeten Symbole bestätigt; keine PRO-Sperre.
3. **`FileManager`/`Data`/`Crypto`/`DocumentPicker`**: alle verwendeten Methoden
   (`appendData/Sync`, `writeAsData/Sync`, `readDirectorySync`, `statSync`, `renameSync`,
   `Data.combine`, `Data.fromBase64String`, `Crypto.sha256`, `Crypto.generateSymmetricKey`,
   `DocumentPicker.exportFiles`, …) in der offiziellen Doku bestätigt.
4. **Lifecycle** (`script/api/en.md`, Changelog 2.4.9 „Script Minimization and Resume"):
   Das Suite-Modell `await Navigation.present(...)` → `Script.exit()` ist das dokumentierte
   „One-time page"-Modell; `Script.minimize()`/`Script.onResume` bleiben bewusst ungenutzt.

## 3. Beispiel-Scripte von scriptingfun (Referenzen, heruntergeladen)

Alle vier Referenz-Repositories wurden am 2026-08-13 geklont (`.work/references/`):

| Repository | Commit | Zweck für dieses Projekt |
|---|---|---|
| `ScriptingApp/Community-Scripts` | `1eb8783` | 60+ fertige `.scripting`-Pakete (u. a. `BBplayer.scripting`, `IPA-Tool.scripting`, `Script Launchpad.scripting`) als Struktur-/Pattern-Referenz |
| `ScriptingApp/scripts` | `69115b3` | Offizielle Beispiel-Scripte (`Video to Live Photo`: `index.tsx` + `script.json`) |
| `ScriptingApp/skills` | `749a52a` | Offizielle Skill-Pakete der App (`isomorphic-git`, `ssh-manager`, `media-download`, `rich-charts`, …) |
| `ScriptingApp/scripting-app-development` | `2991c41` | **Offizieller Entwicklungs-Skill für Desktop-Coding-Agents** — Grundlage von `skills.md` |
| `ScriptingApp/ScriptingApp.github.io` | `34c59e9` | Offizielles Doku-Repo inkl. `Scripting Documentation.zip` |

Beobachtete Muster aus den Community-Scripten (verifiziert durch Entpacken): ein `.scripting`-Paket
ist ein flaches ZIP mit `script.json` + `index.tsx` (+ optionale Entry-Points wie
`home_screen_default_ui.tsx`, weitere TSX-Seiten, Assets) — identisch zum hiesigen Paketformat;
die Suite bleibt damit importkompatibel.

## 4. Skills/Agent-Konvention (warum skills.md + agent.md)

- App-Historie: „Added support for AI features such as memory and skills" (v3.1.0). Die App
  importiert Skill-Pakete über `https://www.scripting.fun/import_skills/` (GitHub-Repo oder ZIP)
  und warnt dort ausdrücklich vor fremden Scripts.
- Die Organisation liefert mit `scripting-app-development/SKILL.md` das offizielle Skill-Format:
  YAML-Frontmatter (`name`, `description`) + technischer Inhalt + `references/` + `checklists/`.
- `skills.md` dieses Projekts übernimmt den offiziellen Skill **wortgleich** und ergänzt ein klar
  abgetrenntes Projekt-Addendum (Free-Tier-Policy, API-Anker, Launch-Vertrag, Verifizierungsloop).
- `agent.md` folgt der AGENTS.md-Konvention (Agent-Instruktionen: Kontext, harte Grenzen,
  Arbeitsablauf, Verifizierungsbefehle, Release-Regeln) — so vorgesehen für LLM-Coding-Agenten.

## 5. Verifizierungsumgebung (Sandbox, 2026-08-13)

- Node.js v22.22.3, npm 10.9.8, Python 3.11.2; `tsx` + `typescript` lokal installiert
  (`.work-npm/`, nicht Teil des Distributables).
- Direkte HTTPS-Downloads sind in der Sandbox blockiert; `git`-Klone funktionieren —
  deshalb Dokumentation/Referenzen ausschließlich über GitHub bezogen.
- **PUC Lua 5.1** für die Bridge-Tests selbst gebaut: `lua/lua` Tag `v5.1.1`
  (Tag `v5.1.5` existiert im GitHub-Mirror nicht), Readline-Include deaktiviert
  (`luaconf.h`), `MYLIBS="-lm -ldl"`. Da dem Tag `luac.c` fehlt, emuliert ein
  dokumentierter `luac`-Shim (`loadfile`-Parse) das für `test_mod_option_bridge.py`
  benötigte `luac -p`.
- Test-Mapping: `scripting` → `tools/scripting-node-stub.ts` via tsconfig-`paths`
  (`.work/tsconfig.test.json`); voller Strict-Typecheck via `.work/tsconfig.full.json`.

## 6. Ergebnis der Recherche für 3.4.0

1. Downloads streamen über die **dokumentierte** `Response.body`-Oberfläche (Fortschritt/Speicher korrekt auf aktuellen App-Versionen).
2. Launch-Injektion als **chunked Base64** (≤ 2^20 Zeichen/Chunk, 4-Zeichen-aligned) mit einem kanonischen Decoder (`runtime/decode.js`) — reduziert den Browser-Peak-Speicher von „gesamtes Paket als ein `atob`-String + manuelle Kopie" auf „ein Chunk Transient" und dekodiert nativ schneller; adressiert das in README/ARCHITECTURE offen ausgewiesene Device-Risiko „peak memory during Base64 decoding".
3. Free-Tier-Garantie statisch verschärft (PRO-Token-Bannliste erweitert, Server-Bann beibehalten).
4. `skills.md` + `agent.md` nach offizieller LLM-Konvention; `RESEARCH.md` + `SOURCES.md` dokumentieren die Provenienz.
