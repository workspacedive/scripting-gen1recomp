import { Path } from "scripting"
import { activeComponentStatus, activeEngineLayersAsync, activeWebRuntimeAsync } from "./components"
import { invalidateNativeModOptionState, nativeModOptionsLaunchEnvelope } from "./mod-options"
import { loadSettings, saveSettings } from "./settings"
import type { GameRecord, LibraryDocument } from "./types"
import {
  RUNTIME_TEMP_ROOT,
  SAVES_ROOT,
  bundledRuntimePath,
  gameRomPath,
} from "./paths"
import { recordPlayed } from "./library"
import { loadModLibrary, modPackageFiles } from "./mods"
import { beginRuntimeRecovery, clearRuntimeRecovery, recoverInterruptedRuntime } from "./runtime-recovery"
import {
  acceptWebDiagnosticEnvelope,
  beginDiagnosticSession,
  endDiagnosticSession,
  recordDiagnostic,
  recordDiagnosticError,
} from "./diagnostics"

const SAVE_FS_ROOT = "/home/web_user/love/pokemon-love2d"
const MAX_SNAPSHOT_FILES = 128
const MAX_SNAPSHOT_FILE_BYTES = 8 * 1024 * 1024
const MAX_SNAPSHOT_TOTAL_BYTES = 24 * 1024 * 1024

const RUNTIME_FILES = ["index.html", "runtime.css", "binary-transport.js"] as const
const BINARY_CHUNK_BYTES = 1024 * 1024

type BinaryKind = "wasm" | "package"

type PackageFile = {
  filename: string
  crunched: 0
  start: number
  end: number
  audio: false
}

type SaveSnapshot = {
  files?: unknown
  complete?: unknown
}

type RuntimeStatus = {
  kind?: unknown
  message?: unknown
}

type ClosePlayerMessage = {
  reason?: unknown
  message?: unknown
  status?: unknown
}

type RuntimeMetric = {
  fps: number
  slowFramePercent: number
  worstFrameMs: number
}

function parsedMetric(value: string): RuntimeMetric | null {
  try {
    const metric = JSON.parse(value) as Partial<RuntimeMetric>
    if (!Number.isFinite(metric.fps) || Number(metric.fps) < 0 || Number(metric.fps) > 240
        || !Number.isFinite(metric.slowFramePercent) || Number(metric.slowFramePercent) < 0 || Number(metric.slowFramePercent) > 100
        || !Number.isFinite(metric.worstFrameMs) || Number(metric.worstFrameMs) < 0 || Number(metric.worstFrameMs) > 10_000) return null
    return {
      fps: Number(metric.fps),
      slowFramePercent: Number(metric.slowFramePercent),
      worstFrameMs: Number(metric.worstFrameMs),
    }
  } catch {
    return null
  }
}

function randomToken(): string {
  return Crypto.generateSymmetricKey(128).toHexString().toLowerCase()
}

function safeSaveRelativePath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 180) return null
  if (!/^[A-Za-z0-9._/-]+$/.test(value) || value.startsWith("/") || value.includes("..") || value.includes("//")) return null
  if (/^options\.lua(?:\.(?:bak|tmp))?$/.test(value)) return value
  if (value === "native_mod_state.json" || value === "native_mod_options.json") return value
  if (/^lua-error\.log(?:\.1)?$/.test(value)) return value
  if (/^save(?:_(?:blue|yellow|gold))?\.lua(?:\.(?:bak|tmp))?$/.test(value)) return value
  if (/^saves\/(?:red|blue|yellow|gold)\/[A-Za-z0-9._/-]+$/.test(value)) return value
  return null
}

function writeSaveSnapshot(message: SaveSnapshot, sessionId: string): { ok: boolean; files: number } {
  if (!Array.isArray(message.files) || message.files.length > MAX_SNAPSHOT_FILES
      || (message.files.length === 0 && message.complete !== true)) {
    recordDiagnostic(sessionId, "save", "warning", "snapshot_rejected", "The native snapshot envelope was invalid.", {
      filesIsArray: Array.isArray(message.files),
      fileCount: Array.isArray(message.files) ? message.files.length : null,
      complete: message.complete === true,
    })
    return { ok: false, files: 0 }
  }
  const staging = `${SAVES_ROOT}.staging`
  if (FileManager.existsSync(staging)) FileManager.removeSync(staging)
  FileManager.createDirectorySync(staging, true)
  let total = 0
  let written = 0
  try {
    for (const item of message.files) {
      if (item == null || typeof item !== "object") throw new Error("Invalid save snapshot item.")
      const value = item as { path?: unknown; base64?: unknown }
      const relative = safeSaveRelativePath(value.path)
      if (relative == null || typeof value.base64 !== "string") throw new Error("Invalid save snapshot path or data.")
      if (value.base64 === "") continue
      if (value.base64.length > Math.ceil(MAX_SNAPSHOT_FILE_BYTES * 4 / 3) + 8) throw new Error("Save snapshot file exceeds the safety limit.")
      const data = Data.fromBase64String(value.base64)
      if (data == null || data.size > MAX_SNAPSHOT_FILE_BYTES) throw new Error("Save snapshot data is invalid or too large.")
      total += data.size
      if (total > MAX_SNAPSHOT_TOTAL_BYTES) throw new Error("Save snapshot exceeds the total safety limit.")
      const destination = Path.join(staging, relative)
      const parent = destination.replace(/\/[^/]+$/, "")
      if (!FileManager.existsSync(parent)) FileManager.createDirectorySync(parent, true)
      FileManager.writeAsDataSync(destination, data)
      written += 1
    }
    if (written === 0 && message.complete !== true) throw new Error("The save snapshot was empty.")
    if (FileManager.existsSync(SAVES_ROOT)) FileManager.removeSync(SAVES_ROOT)
    FileManager.renameSync(staging, SAVES_ROOT)
    invalidateNativeModOptionState()
    recordDiagnostic(sessionId, "save", "info", "snapshot_committed", "The complete native save snapshot was committed.", {
      files: written,
      bytes: total,
    })
    return { ok: true, files: written }
  } catch (error) {
    if (FileManager.existsSync(staging)) FileManager.removeSync(staging)
    recordDiagnosticError(sessionId, "save", "snapshot_failed", error, { written, bytes: total })
    console.error("Gen1Recomp save snapshot rejected:", error)
    return { ok: false, files: 0 }
  }
}

async function savedFiles(): Promise<Array<{ relative: string; data: Data }>> {
  if (!await FileManager.exists(SAVES_ROOT)) return []
  const result: Array<{ relative: string; data: Data }> = []
  let total = 0
  const walk = async (directory: string, prefix: string): Promise<void> => {
    for (const entry of await FileManager.readDirectory(directory, false)) {
      const full = entry.startsWith("/") ? entry : Path.join(directory, entry)
      const name = full.replace(/\\/g, "/").split("/").pop() || ""
      if (name === "") continue
      const relative = prefix === "" ? name : `${prefix}/${name}`
      if (await FileManager.isDirectory(full)) {
        await walk(full, relative)
      } else {
        const safe = safeSaveRelativePath(relative)
        if (safe == null || safe === "native_mod_state.json" || safe === "native_mod_options.json") continue
        const data = await FileManager.readAsData(full)
        if (data == null) continue
        if (data.size > MAX_SNAPSHOT_FILE_BYTES) throw new Error("A mirrored save file exceeds the safety limit.")
        if (result.length >= MAX_SNAPSHOT_FILES || total + data.size > MAX_SNAPSHOT_TOTAL_BYTES) {
          throw new Error("The native save mirror exceeds the launch safety limits.")
        }
        total += data.size
        result.push({ relative: safe, data })
      }
    }
  }
  await walk(SAVES_ROOT, "")
  return result
}

function nativeLaunchCapabilities(): Record<string, unknown> {
  return {
    schema: 1,
    backgroundCpu: typeof Thread === "object" && typeof Thread.runInBackground === "function",
    asyncFileIO: typeof FileManager.readAsData === "function" && typeof FileManager.writeAsData === "function",
    dataSlice: typeof Data.fromRawString("probe", "utf-8")?.slice === "function",
    chunkTransport: true,
    chunkBytes: BINARY_CHUNK_BYTES,
  }
}

function binaryChunkName(kind: BinaryKind, index: number): string {
  return `binary-${kind}-${String(index).padStart(4, "0")}.js`
}

function binaryChunkCount(parts: Data[]): number {
  return parts.reduce((count, part) => count + Math.ceil(part.size / BINARY_CHUNK_BYTES), 0)
}

async function writeBinaryChunks(
  directory: string,
  kind: BinaryKind,
  parts: Data[],
): Promise<{ files: string[]; bytes: number }> {
  const files: string[] = []
  let index = 0
  let offset = 0
  for (const part of parts) {
    for (let start = 0; start < part.size; start += BINARY_CHUNK_BYTES) {
      const end = Math.min(part.size, start + BINARY_CHUNK_BYTES)
      const chunk = part.slice(start, end)
      const name = binaryChunkName(kind, index)
      const source = `window.Gen1BinaryTransport.append(${JSON.stringify(kind)},${index},${offset},${chunk.size},${JSON.stringify(chunk.toBase64String())});if(document.currentScript)document.currentScript.remove();\n`
      await FileManager.writeAsString(Path.join(directory, name), source)
      files.push(name)
      index += 1
      offset += chunk.size
    }
  }
  return { files, bytes: offset }
}

async function prepareRuntime(game: GameRecord, sessionId: string): Promise<{ directory: string; entry: string }> {
  const directory = RUNTIME_TEMP_ROOT
  recordDiagnostic(sessionId, "launcher", "info", "runtime_prepare_begin", "Preparing the private local runtime directory.", {
    edition: game.edition,
    support: game.recompSupport,
    romBytes: game.byteLength,
  })
  try {
    const recovered = await recoverInterruptedRuntime(directory)
    if (recovered.journalFound || recovered.temporaryDirectoryFound) {
      recordDiagnostic(sessionId, "recovery", "warning", "interrupted_runtime_recovered",
        "An interrupted private launch was found and its temporary payload was removed before rebuilding.", recovered)
    }
    await FileManager.createDirectory(directory, true)
    await beginRuntimeRecovery(sessionId)

    const capabilities = nativeLaunchCapabilities()
    recordDiagnostic(sessionId, "capability", "info", "native_launch_contract", "The free-tier launch capability contract was probed.", capabilities)
    const [engineLayers, rom, webRuntime] = await Promise.all([
      activeEngineLayersAsync(),
      FileManager.readAsData(gameRomPath(game.id, game.romFileName)),
      activeWebRuntimeAsync(),
    ])
    if (rom == null) throw new Error("The imported ROM could not be read.")
    const componentStatus = activeComponentStatus()
    if (engineLayers.migration != null) {
      recordDiagnostic(
        sessionId,
        "components",
        engineLayers.migration.status === "upgraded" ? "info" : "warning",
        engineLayers.migration.status === "upgraded" ? "execution_layer_migrated" : "execution_layer_migration_failed",
        engineLayers.migration.status === "upgraded"
          ? "The verified installed core was retained and its revision-8 source layer was transactionally regenerated for revision 9."
          : "The older installed source layer could not be migrated; the complete bundled layer/core pair was selected.",
        engineLayers.migration,
      )
    }
    const wasm = webRuntime.wasm
    recordDiagnostic(sessionId, "launcher", "info", "components_verified", "The execution layer, immutable core, and Web runtime digests were verified before launch.", {
      components: componentStatus,
      selectedEngineSource: engineLayers.source,
      selectedLayerSource: engineLayers.layerSource,
      layerVersion: engineLayers.layerVersion,
      layerBytes: engineLayers.layer.size,
      coreVersion: engineLayers.coreVersion,
      coreBytes: engineLayers.core.size,
      runtimeJsBytes: webRuntime.js.size,
      runtimeWasmBytes: wasm.size,
      romBytes: rom.size,
    })

    for (const name of RUNTIME_FILES) {
      await FileManager.copyFile(bundledRuntimePath(name), Path.join(directory, name))
    }
    await FileManager.writeAsData(Path.join(directory, "love.js"), webRuntime.js)
    await FileManager.copyFile(bundledRuntimePath("game-loader.template.js"), Path.join(directory, "game.js"))

    const parts: Data[] = [engineLayers.layer, engineLayers.core, rom]
    const files: PackageFile[] = [
      { filename: "/game.love", crunched: 0, start: 0, end: engineLayers.layer.size, audio: false },
      {
        filename: "/gen1recomp-core.love",
        crunched: 0,
        start: engineLayers.layer.size,
        end: engineLayers.layer.size + engineLayers.core.size,
        audio: false,
      },
      {
        filename: `/web-rom-${game.edition}.gbc`,
        crunched: 0,
        start: engineLayers.layer.size + engineLayers.core.size,
        end: engineLayers.layer.size + engineLayers.core.size + rom.size,
        audio: false,
      },
    ]
    let offset = engineLayers.layer.size + engineLayers.core.size + rom.size
    const restoredSaves = await savedFiles()
    recordDiagnostic(sessionId, "launcher", "info", "save_restore_inventory", "Validated save files were selected for private injection.", {
      files: restoredSaves.length,
      bytes: restoredSaves.reduce((sum, saved) => sum + saved.data.size, 0),
    })
    for (const saved of restoredSaves) {
      files.push({
        filename: `${SAVE_FS_ROOT}/${saved.relative}`,
        crunched: 0,
        start: offset,
        end: offset + saved.data.size,
        audio: false,
      })
      parts.push(saved.data)
      offset += saved.data.size
    }
    const modFiles = await modPackageFiles()
    recordDiagnostic(sessionId, "launcher", "info", "mod_injection_inventory", "Integrity-verified native mod payloads were selected for injection.", {
      files: modFiles.map(file => ({ filename: file.filename, bytes: file.data.size })),
      totalBytes: modFiles.reduce((sum, file) => sum + file.data.size, 0),
    })
    for (const modFile of modFiles) {
      files.push({
        filename: modFile.filename,
        crunched: 0,
        start: offset,
        end: offset + modFile.data.size,
        audio: false,
      })
      parts.push(modFile.data)
      offset += modFile.data.size
    }
    const settings = loadSettings()
    const modOptions = Data.fromRawString(JSON.stringify(
      nativeModOptionsLaunchEnvelope(settings.performanceProfile, loadModLibrary()),
    ), "utf-8")
    if (modOptions == null) throw new Error("The native performance profile could not be encoded.")
    files.push({
      filename: `${SAVE_FS_ROOT}/native_mod_options.json`,
      crunched: 0,
      start: offset,
      end: offset + modOptions.size,
      audio: false,
    })
    parts.push(modOptions)
    offset += modOptions.size

    const expectedWasmChunks = binaryChunkCount([wasm])
    const expectedPackageChunks = binaryChunkCount(parts)
    const wasmFiles = Array.from({ length: expectedWasmChunks }, (_, index) => binaryChunkName("wasm", index))
    const packageFiles = Array.from({ length: expectedPackageChunks }, (_, index) => binaryChunkName("package", index))
    const launch = {
      binaryTransport: {
        schema: 1,
        chunkBytes: BINARY_CHUNK_BYTES,
        wasm: { bytes: wasm.size, files: wasmFiles },
        package: { bytes: offset, files: packageFiles },
      },
      packageMetadata: {
        package_uuid: randomToken(),
        remote_package_size: offset,
        files,
      },
      runtimeOptions: {
        saveSyncSeconds: settings.saveSyncSeconds,
        performanceProfile: settings.performanceProfile,
        diagnosticSessionId: sessionId,
        hostCapabilities: capabilities,
      },
    }
    await FileManager.writeAsString(
      Path.join(directory, "launch.js"),
      `window.Gen1Launch = ${JSON.stringify(launch)};\n`,
    )
    const wasmChunks = await writeBinaryChunks(directory, "wasm", [wasm])
    const packageChunks = await writeBinaryChunks(directory, "package", parts)
    if (wasmChunks.bytes !== wasm.size || wasmChunks.files.length !== expectedWasmChunks
        || packageChunks.bytes !== offset || packageChunks.files.length !== expectedPackageChunks) {
      throw new Error("The bounded binary transport did not match its launch metadata.")
    }
    recordDiagnostic(sessionId, "launcher", "info", "runtime_prepare_complete", "The private chunked launch payload and local runtime files were created.", {
      payloadBytes: offset,
      transport: {
        schema: 1,
        chunkBytes: BINARY_CHUNK_BYTES,
        wasmChunks: wasmChunks.files.length,
        packageChunks: packageChunks.files.length,
      },
      injectedFiles: files.map(file => ({ filename: file.filename, bytes: file.end - file.start })),
      saveSyncSeconds: settings.saveSyncSeconds,
      performanceProfile: settings.performanceProfile,
    })
    return { directory, entry: Path.join(directory, "index.html") }
  } catch (error) {
    recordDiagnosticError(sessionId, "launcher", "runtime_prepare_failed", error)
    if (await FileManager.exists(directory)) await FileManager.remove(directory)
    try { await clearRuntimeRecovery(sessionId) } catch (recoveryError) {
      recordDiagnosticError(sessionId, "recovery", "recovery_marker_cleanup_failed", recoveryError)
    }
    throw error
  }
}

export async function launchGen1Recomp(game: GameRecord, library: LibraryDocument): Promise<void> {
  const sessionId = beginDiagnosticSession("game-launch", {
    edition: game.edition,
    support: game.recompSupport,
    romBytes: game.byteLength,
  })
  let runtime: { directory: string; entry: string } | null = null
  let controller: WebViewController | null = null
  let ready = false
  let runtimeError: string | null = null
  let latestMetric: RuntimeMetric | null = null
  let dismissalRequested = false
  let outcome = "closed"

  try {
    if (game.recompSupport === "unsupported") {
      throw new Error("This ROM is not supported by the bundled Gen1Recomp release.")
    }

    runtime = await prepareRuntime(game, sessionId)
    controller = new WebViewController()
    recordDiagnostic(sessionId, "webview", "info", "controller_created", "A persistent local WebViewController was created.")

    controller.shouldAllowRequest = async request => {
      const allowed = request.url.startsWith("file:")
        || request.url.startsWith("blob:")
        || request.url.startsWith("data:")
        || request.url === "about:blank"
      const loggedUrl = request.url.startsWith("data:")
        ? `${request.url.slice(0, request.url.indexOf(",") >= 0 ? request.url.indexOf(",") : Math.min(80, request.url.length))},[payload omitted; ${request.url.length} characters]`
        : request.url.startsWith("blob:") ? "blob:[local object URL]" : request.url
      recordDiagnostic(sessionId, "webview", allowed ? "debug" : "warning", allowed ? "request_allowed" : "request_blocked", `${request.method ?? "GET"} ${loggedUrl}`)
      return allowed
    }

    await controller.addScriptMessageHandler<unknown, { ok: boolean; accepted: number; rejected: number }>("runtimeDiagnostic", message => {
      return acceptWebDiagnosticEnvelope(
        sessionId,
        message == null || typeof message !== "object" ? undefined : message,
      )
    })
    await controller.addScriptMessageHandler<SaveSnapshot, { ok: boolean; files: number }>("saveSnapshot", message => {
      return writeSaveSnapshot(message ?? {}, sessionId)
    })
    await controller.addScriptMessageHandler<ClosePlayerMessage, { ok: true }>("closePlayer", async message => {
      const reason = typeof message?.reason === "string" ? message.reason : "web-request"
      recordDiagnostic(sessionId, "webview", "info", "close_requested", reason, {
        message: typeof message?.message === "string" ? message.message : null,
        status: typeof message?.status === "number" ? message.status : null,
      })
      if (ready && reason === "browser-alert-after-ready") {
        // Defense in depth for an older page bundle: Davidobot's LÖVE build
        // raises this generic alert even when Lua pcall catches the exception.
        // onAbort/onExit/window-error use distinct reasons and remain fatal.
        recordDiagnostic(sessionId, "webview", "warning", "caught_alert_close_ignored",
          "A generic post-ready browser alert was retained without dismissing the running game.", {
            message: typeof message?.message === "string" ? message.message : null,
          })
        return { ok: true }
      }
      if (dismissalRequested) {
        recordDiagnostic(sessionId, "webview", "debug", "close_coalesced", "A player dismissal is already in progress.")
        return { ok: true }
      }
      dismissalRequested = true
      try {
        if (controller == null) throw new Error("The native player controller is unavailable for dismissal.")
        await controller.dismiss()
        recordDiagnostic(sessionId, "webview", "info", "dismiss_requested", "The documented native player dismissal completed.")
        return { ok: true }
      } catch (error) {
        dismissalRequested = false
        recordDiagnosticError(sessionId, "webview", "dismiss_failed", error)
        throw error
      }
    })
    await controller.addScriptMessageHandler<RuntimeStatus, { ok: true }>("runtimeStatus", message => {
      const kind = typeof message?.kind === "string" ? message.kind : "log"
      const text = typeof message?.message === "string" ? message.message : ""
      const level = kind === "error" ? "error" : kind === "warning" ? "warning" : kind === "metric" ? "debug" : "info"
      recordDiagnostic(sessionId, "runtime", level, `status_${kind.replace(/[^A-Za-z0-9_.:-]/g, "_")}`, text)
      if (kind === "ready" && !ready) {
        ready = true
        outcome = "ready"
        recordPlayed(game, library)
        recordDiagnostic(sessionId, "launcher", "info", "play_recorded", "The verified game-loaded marker updated local play history.")
      } else if (kind === "error") {
        runtimeError = text || "The local runtime reported an error."
      } else if (kind === "metric") {
        latestMetric = parsedMetric(text)
        if (latestMetric == null) {
          recordDiagnostic(sessionId, "runtime", "warning", "metric_rejected", "A malformed performance metric was ignored.", { raw: text })
        }
      }
      if (kind === "error" || kind === "warning") console.warn(`Gen1Recomp ${kind}:`, text)
      return { ok: true }
    })
    recordDiagnostic(sessionId, "webview", "info", "message_handlers_ready", "Runtime diagnostics, status, close, and save handlers were registered.")

    recordDiagnostic(sessionId, "webview", "info", "load_begin", runtime.entry)
    const loaded = await controller.loadFile(runtime.entry, runtime.directory)
    recordDiagnostic(sessionId, "webview", loaded ? "info" : "error", "load_complete", `loaded=${loaded}`)
    if (!loaded) throw new Error("The local Gen1Recomp page could not be loaded.")

    recordDiagnostic(sessionId, "webview", "info", "presentation_begin", "Presenting the local player full-screen.")
    await controller.present({ fullscreen: true, navigationTitle: game.title })
    recordDiagnostic(sessionId, "webview", "info", "presentation_end", "The player was dismissed.")

    try {
      const synchronized = await controller.evaluateJavaScript("return window.Gen1RecompHost ? window.Gen1RecompHost.syncAndSnapshot() : false")
      recordDiagnostic(sessionId, "save", synchronized ? "info" : "warning", "final_sync_result", `result=${String(synchronized)}`)
    } catch (error) {
      recordDiagnosticError(sessionId, "save", "final_sync_unavailable", error)
      console.warn("Final Gen1Recomp save synchronization was unavailable:", error)
    }

    const completedMetric = latestMetric as RuntimeMetric | null
    if (completedMetric != null) {
      const settings = loadSettings()
      settings.lastPerformance = {
        ...completedMetric,
        measuredAt: new Date().toISOString(),
        profile: settings.performanceProfile,
      }
      saveSettings(settings)
      recordDiagnostic(sessionId, "performance", "info", "metric_saved", "The latest bounded performance metric was saved.", completedMetric)
    }
    if (runtimeError != null && !ready) {
      outcome = "runtime-error-before-ready"
      throw new Error(runtimeError)
    }
    if (runtimeError != null) {
      recordDiagnostic(sessionId, "runtime", "warning", "error_after_ready", runtimeError)
    }
  } catch (error) {
    outcome = "failed"
    recordDiagnosticError(sessionId, "launcher", "launch_failed", error, { ready })
    throw error
  } finally {
    if (controller != null) {
      try {
        controller.dispose()
        recordDiagnostic(sessionId, "webview", "info", "controller_disposed", "The WebViewController was disposed.")
      } catch (error) {
        recordDiagnosticError(sessionId, "webview", "controller_dispose_failed", error)
      }
    }
    if (runtime != null && await FileManager.exists(runtime.directory)) {
      try {
        await FileManager.remove(runtime.directory)
        recordDiagnostic(sessionId, "launcher", "info", "temporary_runtime_removed", "The ROM-bearing temporary launch directory was removed.")
      } catch (error) {
        recordDiagnosticError(sessionId, "launcher", "temporary_runtime_cleanup_failed", error)
      }
    }
    try {
      await clearRuntimeRecovery(sessionId)
      recordDiagnostic(sessionId, "recovery", "debug", "recovery_marker_cleared", "The private launch recovery marker was cleared.")
    } catch (error) {
      recordDiagnosticError(sessionId, "recovery", "recovery_marker_cleanup_failed", error)
    }
    await endDiagnosticSession(sessionId, outcome, { ready, hadRuntimeError: runtimeError != null })
  }
}
