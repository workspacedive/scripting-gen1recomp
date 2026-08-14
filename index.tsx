import {
  Button,
  HStack,
  Image,
  Label,
  LazyVGrid,
  Navigation,
  Picker,
  Path,
  NavigationStack,
  ProgressView,
  RoundedRectangle,
  Script,
  ScrollView,
  Spacer,
  TabView,
  Text,
  Toggle,
  VStack,
  useEffect,
  useState,
} from "scripting"
import type {
  GameRecord,
  InstalledMod,
  LibraryDocument,
  ModLibraryDocument,
  ModOptionPrimitive,
  ModOptionSchemaRow,
  ModRelease,
  OfficialRelease,
} from "./modules/types"
import {
  chooseCustomCover,
  coverPath,
  exportGameFiles,
  formatByteCount,
  importSelectedROMs,
  loadLibrary,
  removeGame,
  resetCustomCover,
  saveLibrary,
} from "./modules/library"
import { launchGen1Recomp } from "./modules/player"
import {
  activeComponentStatus,
  checkEngineRelease,
  checkRuntimeSource,
  engineUpdateAvailable,
  installEngineRelease,
  installExecutionLayer,
  installRuntimeBundle,
  resetEngineComponent,
  resetExecutionLayer,
  resetWebRuntime,
} from "./modules/components"
import type { ActiveComponents, EngineRelease, RuntimeSourceStatus } from "./modules/components"
import { SUITE_VERSION } from "./modules/config"
import type { PerformanceProfile } from "./modules/config"
import { automaticUpdateCheckDue, loadSettings, saveSettings } from "./modules/settings"
import type { SuiteSettings } from "./modules/settings"
import { checkOfficialRelease, downloadVerifiedIPA, loadCachedRelease } from "./modules/releases"
import {
  DRAMATIC_SHAPE_REPO,
  checkModRelease,
  checkModReleaseURL,
  discardPreparedMod,
  downloadAndPrepareMod,
  installPreparedMod,
  loadModLibrary,
  prepareModArchive,
  removeInstalledMod,
  setModEnabled,
  updateAvailable,
} from "./modules/mods"
import type { ModPreparationProgress, PreparedMod } from "./modules/mods"
import {
  modHasDiscoveredOptions,
  modOptionDisplayValue,
  modOptionValue,
  optionsNeedRuntimeDiscovery,
  performanceProfileDidChange,
  restoreNativeModDefaults,
  setNativeModOption,
} from "./modules/mod-options"
import {
  beginDiagnosticSession,
  clearDiagnostics,
  createDiagnosticExport,
  diagnosticSummary,
  endDiagnosticSession,
  recordDiagnostic,
  recordDiagnosticError,
} from "./modules/diagnostics"
import type { DiagnosticExportFormat, DiagnosticSummary } from "./modules/diagnostics"
import {
  cancelDownload,
  downloadProgress,
  isDownloadControlError,
  loadDownloadRecords,
  pauseDownload,
  resumeDownload,
  subscribeDownloads,
} from "./modules/downloads"
import type { DownloadRecord } from "./modules/downloads"

import { T, isGerman } from "./modules/localization"

type AvailableModUpdate = { mod: InstalledMod; release: ModRelease }
type UpdateOverview = {
  engineRelease: EngineRelease | null
  engineAvailable: boolean
  runtime: RuntimeSourceStatus | null
  modUpdates: AvailableModUpdate[]
  errors: string[]
  checkedAt: string
}

const DASHBOARD_DIAGNOSTIC_SESSION = beginDiagnosticSession("dashboard", {
  suiteVersion: SUITE_VERSION,
  language: isGerman ? "de" : "en",
})

function supportLabel(game: GameRecord): string {
  if (game.recompSupport === "stable") return T.recompReady
  if (game.recompSupport === "early") return T.earlySupport
  return T.unsupported
}

function supportColor(game: GameRecord): "green" | "orange" | "secondary" {
  if (game.recompSupport === "stable") return "green"
  if (game.recompSupport === "early") return "orange"
  return "secondary"
}

function dateText(value?: string): string {
  if (value == null) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(isGerman ? "de-DE" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function releaseSubtitle(release: OfficialRelease | null): string {
  return release == null ? T.officialBody : `v${release.version} · ${dateText(release.checkedAt)}`
}

function GameCard({ game, action }: { game: GameRecord; action: () => void }) {
  return (
    <Button action={action} buttonStyle="plain">
      <VStack alignment="leading" spacing={8} frame={{ maxWidth: "infinity" }}>
        <Image
          filePath={coverPath(game)}
          resizable={true}
          aspectRatio={{ value: 0.72, contentMode: "fit" }}
          frame={{ maxWidth: "infinity", height: 224 }}
          interpolation="high"
        />
        <Text font="headline" fontWeight="semibold" lineLimit={1}>{game.title}</Text>
        <HStack spacing={5}>
          <Image
            systemName={game.recompSupport === "stable" ? "checkmark.seal.fill" : game.recompSupport === "early" ? "clock.badge.exclamationmark" : "exclamationmark.triangle.fill"}
            foregroundStyle={supportColor(game)}
          />
          <Text font="caption" foregroundStyle={supportColor(game)} lineLimit={1}>{supportLabel(game)}</Text>
          <Spacer />
        </HStack>
      </VStack>
    </Button>
  )
}

function ToolCard({ title, subtitle, icon, tint, action }: {
  title: string
  subtitle: string
  icon: string
  tint: string
  action: () => void
}) {
  return (
    <Button action={action} buttonStyle="plain">
      <RoundedRectangle
        fill="secondarySystemBackground"
        cornerRadius={20}
        frame={{ maxWidth: "infinity", height: 118 }}
        overlay={
          <VStack alignment="leading" spacing={7} padding={14}>
            <Image systemName={icon} foregroundStyle={tint} font={{ name: "system", size: 24 }} />
            <Spacer />
            <Text font="headline" fontWeight="semibold" lineLimit={1}>{title}</Text>
            <Text font="caption" foregroundStyle="secondary" lineLimit={2}>{subtitle}</Text>
          </VStack>
        }
      />
    </Button>
  )
}

function downloadStateLabel(record: DownloadRecord): string {
  if (record.status === "queued") return T.downloadQueued
  if (record.status === "downloading") return T.downloadInProgress
  if (record.status === "retrying") return `${T.downloadRetry} ${record.attempt + 1}/${6}`
  if (record.status === "verifying") return T.downloadVerifying
  if (record.status === "paused") return T.downloadPaused
  if (record.status === "completed") return T.downloadCompleted
  return T.downloadFailed
}

function downloadDetail(record: DownloadRecord): string {
  const progress = `${formatByteCount(record.downloadedBytes)} / ${formatByteCount(record.totalBytes)}`
  const speed = record.speedBytesPerSecond != null && record.speedBytesPerSecond > 0
    ? ` · ${formatByteCount(Math.round(record.speedBytesPerSecond))}/s` : ""
  const resume = record.resumable === "yes" ? ` · ${T.httpResume}`
    : record.resumable === "no" ? ` · ${T.cleanRestart}` : ""
  return `${progress}${speed}${resume}`
}

function DownloadPanel({ record, onPause, onResume, onRemove }: {
  record: DownloadRecord
  onPause: () => void
  onResume: () => void
  onRemove: () => void
}) {
  const active = ["queued", "downloading", "retrying"].includes(record.status)
  const canResume = record.status === "paused" || record.status === "failed"
  const tint = record.status === "failed" ? "orange" : record.status === "completed" ? "green" : "#7457F5"
  return (
    <VStack alignment="leading" spacing={9} padding={15} frame={{ maxWidth: "infinity" }} background="secondarySystemBackground" cornerRadius={18}>
      <HStack spacing={10}>
        <RoundedRectangle fill="tertiarySystemBackground" cornerRadius={11} frame={{ width: 40, height: 40 }} overlay={
          <Image systemName={record.status === "completed" ? "checkmark.shield.fill" : "arrow.down.circle.fill"} foregroundStyle={tint} font={{ name: "system", size: 21 }} />
        } />
        <VStack alignment="leading" spacing={3}>
          <Text font="headline" fontWeight="semibold" lineLimit={1}>{record.title}</Text>
          <Text font="caption" foregroundStyle={tint} lineLimit={1}>{downloadStateLabel(record)}</Text>
        </VStack>
        <Spacer />
      </HStack>
      <ProgressView value={downloadProgress(record)} total={1} progressViewStyle="linear" />
      <Text font="caption" foregroundStyle="secondary" lineLimit={2}>{downloadDetail(record)}</Text>
      {record.error == null ? null : <Text font="caption" foregroundStyle={record.status === "failed" ? "orange" : "secondary"} lineLimit={3}>{record.error}</Text>}
      <HStack spacing={9}>
        {active ? <Button title={T.pause} systemImage="pause.fill" action={onPause} buttonStyle="bordered" /> : null}
        {canResume ? <Button title={T.resume} systemImage="arrow.clockwise" action={onResume} buttonStyle="borderedProminent" /> : null}
        {!active ? <Button title={record.status === "completed" ? T.clearDownload : T.cancel} systemImage="xmark" action={onRemove} buttonStyle="bordered" /> : (
          <Button title={T.cancel} systemImage="xmark" action={onRemove} buttonStyle="bordered" />
        )}
      </HStack>
    </VStack>
  )
}

export default function App() {
  const dismiss = Navigation.useDismiss()
  const [library, setLibrary] = useState<LibraryDocument>(loadLibrary())
  const [release, setRelease] = useState<OfficialRelease | null>(loadCachedRelease())
  const [mods, setMods] = useState<ModLibraryDocument>(loadModLibrary())
  const [settings, setSettings] = useState<SuiteSettings>(loadSettings())
  const [components, setComponents] = useState<ActiveComponents>(activeComponentStatus())
  const [updates, setUpdates] = useState<UpdateOverview | null>(null)
  const [tabIndex, setTabIndex] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const [diagnostics, setDiagnostics] = useState<DiagnosticSummary>(diagnosticSummary())
  const [downloads, setDownloads] = useState<DownloadRecord[]>(loadDownloadRecords())
  const [editingModOptions, setEditingModOptions] = useState<string | null>(null)
  const [modOptionRevision, setModOptionRevision] = useState(0)

  const refreshLibrary = () => setLibrary({ ...library, games: [...library.games], settings: { ...library.settings } })
  const refreshMods = (next?: ModLibraryDocument) => setMods(next ?? loadModLibrary())

  const fail = async (error: unknown, includeDiagnosticHint = false) => {
    if (isDownloadControlError(error)) {
      setStatus(error.message)
      return
    }
    recordDiagnosticError(DASHBOARD_DIAGNOSTIC_SESSION, "dashboard", "action_failed", error)
    setDiagnostics(diagnosticSummary())
    setStatus("")
    const message = error instanceof Error ? error.message : String(error)
    await Dialog.alert({
      title: T.error,
      message: includeDiagnosticHint ? `${message}\n\n${T.fatalDiagnosticsHint}` : message,
      buttonLabel: T.close,
    })
  }

  const pauseManagedDownload = (record: DownloadRecord) => {
    try {
      pauseDownload(record.id)
      setStatus(`${record.title} · ${T.downloadPaused}`)
    } catch (error) {
      void fail(error)
    }
  }

  const resumeManagedDownload = async (record: DownloadRecord) => {
    if (busy != null) return
    setBusy("download-resume")
    setStatus(`${record.title} · ${T.resumingDownload}`)
    try {
      await resumeDownload(record.id)
      setStatus(`${record.title} · ${T.resumedDownloadReady}`)
    } catch (error) {
      await fail(error)
    } finally {
      setBusy(null)
    }
  }

  const removeManagedDownload = async (record: DownloadRecord) => {
    const active = ["queued", "downloading", "retrying", "verifying"].includes(record.status)
    if (active) {
      const confirmed = await Dialog.confirm({
        title: T.cancelDownloadTitle,
        message: T.cancelDownloadBody,
        cancelLabel: T.cancel,
        confirmLabel: T.cancelDownloadAction,
      })
      if (!confirmed) return
    }
    try {
      cancelDownload(record.id)
      setStatus(active ? T.cancelDownloadAction : "")
    } catch (error) {
      await fail(error)
    }
  }

  const managedDownloadPanel = (record: DownloadRecord) => (
    <DownloadPanel
      record={record}
      onPause={() => pauseManagedDownload(record)}
      onResume={() => { void resumeManagedDownload(record) }}
      onRemove={() => { void removeManagedDownload(record) }}
    />
  )

  const importGames = async () => {
    if (busy != null) return
    setBusy("import")
    setStatus(T.importing)
    try {
      const result = await importSelectedROMs(library)
      if (result == null) {
        setStatus("")
        return
      }
      refreshLibrary()
      const lines = [
        isGerman ? `${result.imported.length} importiert.` : `${result.imported.length} imported.`,
        result.duplicateNames.length > 0 ? (isGerman ? `${result.duplicateNames.length} Duplikat(e) übersprungen.` : `${result.duplicateNames.length} duplicate(s) skipped.`) : "",
        ...result.rejected.slice(0, 5).map(item => `${item.name}: ${item.reason}`),
      ].filter(Boolean)
      setStatus(result.imported.length > 0 ? `${result.imported.length} ${result.imported.length === 1 ? T.game : T.games} · ${T.statusLocal}` : "")
      await Dialog.alert({
        title: result.imported.length > 0 ? T.importedTitle : T.importFailed,
        message: lines.join("\n\n"),
        buttonLabel: T.close,
      })
    } catch (error) {
      await fail(error)
    } finally {
      setBusy(null)
    }
  }

  const showDetails = async (game: GameRecord) => {
    const caveat = game.recompSupport === "early" ? `\n\n${T.goldCaveat}`
      : game.recompSupport === "unsupported" ? `\n\n${T.unsupportedCaveat}` : ""
    await Dialog.alert({
      title: game.title,
      message: [
        `${supportLabel(game)} · ${game.colorMode}`,
        `${formatByteCount(game.byteLength)} · ${game.originalFileName}`,
        `SHA-1\n${game.sha1}`,
        `${isGerman ? "Importiert" : "Imported"}: ${dateText(game.importedAt)}`,
        `${isGerman ? "Gen1Recomp-Starts" : "Gen1Recomp launches"}: ${game.playCount}`,
      ].join("\n\n") + caveat,
      buttonLabel: T.close,
    })
  }

  const playGame = async (game: GameRecord) => {
    if (game.recompSupport === "unsupported") {
      await Dialog.alert({ title: game.title, message: T.unsupportedCaveat, buttonLabel: T.close })
      return
    }
    if (library.settings.showRuntimeNotice) {
      const choice = await Dialog.actionSheet({
        title: T.runtimeNoticeTitle,
        message: T.runtimeNotice,
        actions: [{ label: T.continue }, { label: T.continueDontShow }],
      })
      if (choice == null) return
      if (choice === 1) {
        library.settings.showRuntimeNotice = false
        saveLibrary(library)
        refreshLibrary()
      }
    }
    try {
      setStatus(`${game.title} · Gen1Recomp v${activeComponentStatus().engineVersion}`)
      await launchGen1Recomp(game, library)
      refreshLibrary()
      refreshMods()
      setSettings(loadSettings())
      setComponents(activeComponentStatus())
      setDiagnostics(diagnosticSummary())
      setStatus("")
    } catch (error) {
      await fail(error, true)
    }
  }

  const editCover = async (game: GameRecord) => {
    try {
      if (game.customCoverFileName != null) {
        const choice = await Dialog.actionSheet({
          title: T.cover,
          actions: [{ label: T.chooseCover }, { label: T.resetCover, destructive: true }],
        })
        if (choice === 1) {
          resetCustomCover(game, library)
          refreshLibrary()
          setStatus(T.coverReset)
          return
        }
        if (choice !== 0) return
      }
      if (await chooseCustomCover(game, library)) {
        refreshLibrary()
        setStatus(T.coverUpdated)
      }
    } catch (error) {
      await fail(error)
    }
  }

  const deleteGame = async (game: GameRecord) => {
    const choice = await Dialog.actionSheet({
      title: T.deleteTitle,
      message: T.deleteBody,
      actions: [
        { label: T.keepSaves, destructive: true },
        { label: T.eraseSaves, destructive: true },
      ],
    })
    if (choice == null) return
    const eraseSaves = choice === 1
    const confirmed = await Dialog.confirm({
      title: T.deleteConfirmTitle,
      message: eraseSaves ? T.deleteConfirmErase : T.deleteConfirmKeep,
      cancelLabel: T.cancel,
      confirmLabel: T.remove,
    })
    if (!confirmed) return
    try {
      removeGame(game, library, eraseSaves)
      refreshLibrary()
      setStatus("")
    } catch (error) {
      await fail(error)
    }
  }

  const gameMenu = async (game: GameRecord) => {
    const actions = [
      ...(game.recompSupport === "unsupported" ? [] : [{ id: "play", label: T.play, destructive: false }]),
      { id: "details", label: T.details, destructive: false },
      { id: "cover", label: T.cover, destructive: false },
      { id: "export", label: T.export, destructive: false },
      { id: "delete", label: T.delete, destructive: true },
    ]
    const choice = await Dialog.actionSheet({
      title: game.title,
      message: `${supportLabel(game)} · ${formatByteCount(game.byteLength)}`,
      actions: actions.map(item => ({ label: item.label, destructive: item.destructive })),
    })
    const action = choice == null ? null : actions[choice]?.id
    if (action === "play") await playGame(game)
    if (action === "details") await showDetails(game)
    if (action === "cover") await editCover(game)
    if (action === "export") {
      try {
        const exported = await exportGameFiles(game)
        if (exported.length > 0) setStatus(T.exported)
      } catch (error) {
        await fail(error)
      }
    }
    if (action === "delete") await deleteGame(game)
  }

  const modPermissions = (mod: InstalledMod): string => mod.permissions.length > 0
    ? mod.permissions.join(", ") : T.modNone

  const modDescription = (mod: InstalledMod): string => [
    `${mod.name} · v${mod.version}`,
    mod.description,
    `${formatByteCount(mod.byteLength)} · ${mod.fileCount} ${isGerman ? "Dateien" : "files"}`,
    `${T.modPermissions}: ${modPermissions(mod)}`,
    `${T.modSettings}: ${mod.optionSchema?.rows.length ?? 0}`,
    mod.gameVersion != null ? `Gen1Recomp: ${mod.gameVersion}` : "",
    mod.dependencies.length > 0 ? `${isGerman ? "Abhängigkeiten" : "Dependencies"}: ${mod.dependencies.join(", ")}` : "",
    mod.conflicts.length > 0 ? `${isGerman ? "Konflikte" : "Conflicts"}: ${mod.conflicts.join(", ")}` : "",
    mod.sourceRepo != null ? `GitHub: ${mod.sourceRepo}` : "",
    T.modRestart,
  ].filter(Boolean).join("\n\n")

  const dependencyId = (spec: string): string => spec.match(/^([A-Za-z0-9_-]+)/)?.[1] ?? spec

  const modHealthIssues = (library: ModLibraryDocument): string[] => {
    const installed = new Map(library.mods.map(mod => [mod.id, mod]))
    const issues: string[] = []
    for (const mod of library.mods) {
      if (!mod.enabled) continue
      for (const spec of mod.dependencies) {
        const id = dependencyId(spec)
        const dependency = installed.get(id)
        if (dependency == null) issues.push(`${mod.name}: ${T.missingDependency} · ${spec}`)
        else if (!dependency.enabled) issues.push(`${mod.name}: ${T.disabledDependency} · ${dependency.name}`)
      }
      for (const spec of mod.conflicts) {
        const id = dependencyId(spec)
        const conflict = installed.get(id)
        if (conflict != null && conflict.enabled) issues.push(`${mod.name}: ${T.activeConflict} · ${conflict.name}`)
      }
    }
    return issues
  }

  const showModHealth = async () => {
    const current = loadModLibrary()
    const issues = modHealthIssues(current)
    await Dialog.alert({
      title: T.modHealth,
      message: issues.length === 0 ? T.modHealthReadyBody : issues.slice(0, 20).join("\n\n"),
      buttonLabel: T.close,
    })
  }

  const showLoadReportHelp = async () => {
    await Dialog.alert({ title: T.loadReportTitle, message: T.loadReportBody, buttonLabel: T.close })
  }

  const confirmAndInstallPrepared = async (
    prepared: PreparedMod,
    expectedId?: string,
  ): Promise<boolean> => {
    const existing = loadModLibrary().mods.find(mod => mod.id === prepared.record.id)
    try {
      const confirmed = await Dialog.confirm({
        title: existing == null ? T.modInstalled : T.modUpdated,
        message: modDescription(prepared.record),
        cancelLabel: T.cancel,
        confirmLabel: existing == null ? T.install : T.replace,
      })
      if (!confirmed) return false
      const next = installPreparedMod(prepared, expectedId)
      refreshMods(next)
      setStatus(`${prepared.record.name} v${prepared.record.version} · ${existing == null ? T.modInstalled : T.modUpdated}`)
      return true
    } finally {
      discardPreparedMod(prepared)
    }
  }

  const modPreparationStatus = (name: string, progress: ModPreparationProgress): string => {
    const stage = progress.stage === "scanning" ? T.modScanning
      : progress.stage === "verifying" ? T.modVerifying : T.modPacking
    const percent = progress.total > 0 ? Math.min(100, Math.floor(progress.completed * 100 / progress.total)) : 0
    return `${name} · ${stage} · ${percent}%`
  }

  const importMods = async () => {
    if (busy != null) return
    const trusted = await Dialog.confirm({
      title: T.modSecurityTitle,
      message: T.modSecurityBody,
      cancelLabel: T.cancel,
      confirmLabel: T.continue,
    })
    if (!trusted) return
    const selected = await DocumentPicker.pickFiles({
      types: ["public.zip-archive", "public.data"],
      allowsMultipleSelection: true,
      shouldShowFileExtensions: true,
    })
    if (selected.length === 0) {
      DocumentPicker.stopAcessingSecurityScopedResources()
      return
    }
    setBusy("mod-import")
    setStatus(T.modImporting)
    const failures: string[] = []
    let installed = 0
    try {
      for (const path of selected) {
        const name = path.replace(/\\/g, "/").split("/").pop() || "mod.zip"
        try {
          const prepared = await prepareModArchive(path, {
            onProgress: progress => setStatus(modPreparationStatus(name, progress)),
          })
          if (await confirmAndInstallPrepared(prepared)) installed += 1
        } catch (error) {
          failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      refreshMods()
      await Dialog.alert({
        title: installed > 0 ? T.modInstalled : T.importFailed,
        message: [
          installed > 0 ? (isGerman ? `${installed} Mod(s) installiert.` : `${installed} mod(s) installed.`) : "",
          ...failures.slice(0, 6),
          T.modRestart,
        ].filter(Boolean).join("\n\n"),
        buttonLabel: T.close,
      })
    } finally {
      DocumentPicker.stopAcessingSecurityScopedResources()
      setBusy(null)
      setStatus("")
    }
  }

  const installRelease = async (releaseInfo: ModRelease, expectedId?: string): Promise<void> => {
    const confirmed = await Dialog.confirm({
      title: `${expectedId == null ? T.install : T.update} · v${releaseInfo.version}`,
      message: `${releaseInfo.asset.name} · ${formatByteCount(releaseInfo.asset.size)}\n\nGitHub: ${releaseInfo.repo}`,
      cancelLabel: T.cancel,
      confirmLabel: expectedId == null ? T.install : T.update,
    })
    if (!confirmed) return
    setBusy("mod-download")
    setStatus(T.modDownloading)
    const prepared = await downloadAndPrepareMod(
      releaseInfo,
      progress => setStatus(modPreparationStatus(releaseInfo.asset.name, progress)),
    )
    await confirmAndInstallPrepared(prepared, expectedId)
  }

  const installFromGitHub = async () => {
    if (busy != null) return
    const value = await Dialog.prompt({
      title: T.installFromGitHub,
      message: T.installFromGitHubBody,
      placeholder: "https://github.com/owner/repository/releases/tag/v1.0.0",
      cancelLabel: T.cancel,
      confirmLabel: T.continue,
    })
    if (value == null || value.trim() === "") return
    setBusy("mod-check-url")
    setStatus(T.modChecking)
    try {
      const releaseInfo = await checkModReleaseURL(value)
      await installRelease(releaseInfo)
    } catch (error) {
      await fail(error)
    } finally {
      setBusy(null)
      setStatus("")
    }
  }

  const updateMod = async (mod: InstalledMod) => {
    if (busy != null) return
    if (mod.sourceRepo == null) {
      await Dialog.alert({ title: mod.name, message: T.noUpdateSource, buttonLabel: T.close })
      return
    }
    setBusy("mod-check")
    setStatus(T.modChecking)
    try {
      const latest = await checkModRelease(mod.sourceRepo, mod.id)
      if (!updateAvailable(mod, latest)) {
        setStatus("")
        await Dialog.alert({ title: mod.name, message: `${T.noUpdate}\n\n${mod.version} → ${latest.version}`, buttonLabel: T.close })
        return
      }
      await installRelease(latest, mod.id)
    } catch (error) {
      await fail(error)
    } finally {
      setBusy(null)
      if (busy !== "mod-download") setStatus("")
    }
  }

  const dramaticShape = async () => {
    if (busy != null) return
    const installed = loadModLibrary().mods.find(mod => mod.id === "DRAMATIC_SHAPE")
    if (installed != null) {
      await updateMod({ ...installed, sourceRepo: DRAMATIC_SHAPE_REPO })
      return
    }
    const accepted = await Dialog.confirm({
      title: T.dramaticShape,
      message: `${T.externalModNotice}\n\n${T.modSecurityBody}`,
      cancelLabel: T.cancel,
      confirmLabel: T.continue,
    })
    if (!accepted) return
    setBusy("mod-check")
    setStatus(T.modChecking)
    try {
      const latest = await checkModRelease(DRAMATIC_SHAPE_REPO, "DRAMATIC_SHAPE")
      await installRelease(latest)
    } catch (error) {
      await fail(error)
    } finally {
      setBusy(null)
      setStatus("")
    }
  }

  const showModDetails = async (mod: InstalledMod) => {
    await Dialog.alert({ title: T.modDetails, message: modDescription(mod), buttonLabel: T.close })
  }

  const openModSettings = async (mod: InstalledMod) => {
    if (modHasDiscoveredOptions(mod)) {
      setEditingModOptions(mod.id)
      return
    }
    await Dialog.alert({
      title: optionsNeedRuntimeDiscovery(mod) ? T.modSettingsDiscovery : T.modSettings,
      message: optionsNeedRuntimeDiscovery(mod) ? T.modSettingsDiscoveryBody : T.noModSettings,
      buttonLabel: T.close,
    })
  }

  const commitModOption = (mod: InstalledMod, row: ModOptionSchemaRow, value: ModOptionPrimitive) => {
    try {
      setNativeModOption(mod, row, value)
      setModOptionRevision(modOptionRevision + 1)
      setStatus(`${mod.name} · ${row.label} · ${T.modSettingsApply}`)
    } catch (error) {
      void fail(error)
    }
  }

  const editModOption = async (mod: InstalledMod, row: ModOptionSchemaRow) => {
    const current = modOptionValue(mod, row, settings.performanceProfile)
    if (row.type === "toggle") {
      commitModOption(mod, row, current !== true)
      return
    }
    if (row.type === "choice") {
      const choice = await Dialog.actionSheet({
        title: row.label,
        message: row.description ?? T.modSettingsApply,
        actions: row.choices.map(item => ({
          label: `${typeof current === typeof item.value && current === item.value ? "✓ " : ""}${item.label}`,
        })),
      })
      if (choice != null && row.choices[choice] != null) commitModOption(mod, row, row.choices[choice].value)
      return
    }
    if (row.type === "number") {
      const range = [row.min != null ? `min ${row.min}` : "", row.max != null ? `max ${row.max}` : "", row.step != null ? `step ${row.step}` : ""]
        .filter(Boolean).join(" · ")
      const answer = await Dialog.prompt({
        title: row.label,
        message: [row.description ?? "", range].filter(Boolean).join("\n\n"),
        defaultValue: String(current),
        placeholder: String(row.default),
        cancelLabel: T.cancel,
        confirmLabel: T.continue,
      })
      if (answer == null) return
      const selected = Number(answer.trim())
      const stepUnits = row.step == null ? 0 : (selected - (row.min ?? 0)) / row.step
      const stepAligned = row.step == null || (Number.isFinite(stepUnits)
        && Math.abs(stepUnits - Math.round(stepUnits)) <= 1e-9 * Math.max(1, Math.abs(stepUnits)))
      if (!Number.isFinite(selected) || (row.min != null && selected < row.min)
          || (row.max != null && selected > row.max) || !stepAligned) {
        await Dialog.alert({ title: row.label, message: T.invalidModNumber, buttonLabel: T.close })
        return
      }
      commitModOption(mod, row, selected)
      return
    }
    const answer = await Dialog.prompt({
      title: row.label,
      message: [row.description ?? "", `max ${row.maxLen}`].filter(Boolean).join("\n\n"),
      defaultValue: String(current),
      placeholder: row.default,
      cancelLabel: T.cancel,
      confirmLabel: T.continue,
    })
    if (answer == null) return
    try {
      commitModOption(mod, row, answer)
    } catch (error) {
      await fail(error)
    }
  }

  const restoreModDefaults = async (mod: InstalledMod) => {
    const confirmed = await Dialog.confirm({
      title: T.restoreModDefaults,
      message: T.restoreModDefaultsBody,
      cancelLabel: T.cancel,
      confirmLabel: T.restoreModDefaults,
    })
    if (!confirmed) return
    try {
      restoreNativeModDefaults(mod)
      setModOptionRevision(modOptionRevision + 1)
      setStatus(`${mod.name} · ${T.modDefaultsRestored}`)
    } catch (error) {
      await fail(error)
    }
  }

  const modMenu = async (mod: InstalledMod) => {
    const actions = [
      { id: "toggle", label: mod.enabled ? T.disableMod : T.enableMod, destructive: false },
      { id: "settings", label: `${T.modSettings}${mod.optionSchema == null ? "" : ` (${mod.optionSchema.rows.length})`}`, destructive: false },
      { id: "details", label: T.modDetails, destructive: false },
      ...(mod.sourceRepo == null ? [] : [{ id: "update", label: T.modCheck, destructive: false }, { id: "source", label: T.openSource, destructive: false }]),
      { id: "remove", label: T.removeMod, destructive: true },
    ]
    const choice = await Dialog.actionSheet({
      title: `${mod.enabled ? "✓" : "○"} ${mod.name}`,
      message: `v${mod.version} · ${formatByteCount(mod.byteLength)}\n\n${T.modRestart}`,
      actions: actions.map(action => ({ label: action.label, destructive: action.destructive })),
    })
    const action = choice == null ? null : actions[choice]?.id
    if (action === "toggle") {
      const next = setModEnabled(mod.id, !mod.enabled)
      refreshMods(next)
      setStatus(`${mod.name} · ${!mod.enabled ? T.enableMod : T.disableMod}`)
    }
    if (action === "settings") await openModSettings(mod)
    if (action === "details") await showModDetails(mod)
    if (action === "update") await updateMod(mod)
    if (action === "source" && mod.sourceRepo != null) await Safari.present(`https://github.com/${mod.sourceRepo}`, false)
    if (action === "remove") {
      const confirmed = await Dialog.confirm({
        title: T.removeMod,
        message: `${mod.name}\n\n${T.removeModBody}`,
        cancelLabel: T.cancel,
        confirmLabel: T.remove,
      })
      if (confirmed) {
        refreshMods(removeInstalledMod(mod.id))
        setStatus("")
      }
    }
  }

  const manageMods = async () => {
    const current = loadModLibrary()
    refreshMods(current)
    const dramatic = current.mods.find(mod => mod.id === "DRAMATIC_SHAPE")
    const actions = [
      { id: "import", label: T.importMod },
      { id: "dramatic", label: `${dramatic == null ? T.install : T.modCheck}: ${T.dramaticShape}` },
      ...current.mods.map(mod => ({ id: `mod:${mod.id}`, label: `${mod.enabled ? "✓" : "○"} ${mod.name} · v${mod.version}` })),
    ]
    const choice = await Dialog.actionSheet({
      title: T.mods,
      message: current.mods.length === 0 ? T.noMods : T.modRestart,
      actions: actions.map(action => ({ label: action.label })),
    })
    const action = choice == null ? null : actions[choice]?.id
    if (action === "import") await importMods()
    if (action === "dramatic") await dramaticShape()
    if (action?.startsWith("mod:")) {
      const mod = current.mods.find(item => item.id === action.slice(4))
      if (mod != null) await modMenu(mod)
    }
  }

  const officialRelease = async () => {
    if (busy != null) return
    setBusy("release")
    setStatus(T.checking)
    try {
      const latest = await checkOfficialRelease()
      setRelease(latest)
      setStatus(`Gen1Recomp v${latest.version}`)
      const choices = [] as Array<{ id: "download" | "notes"; label: string }>
      if (latest.ipa != null) choices.push({ id: "download", label: T.downloadIPA })
      choices.push({ id: "notes", label: T.releaseNotes })
      const choice = await Dialog.actionSheet({
        title: `${T.releaseTitle} v${latest.version}`,
        message: latest.ipa == null
          ? (isGerman ? "Dieses Release enthält kein iOS-IPA." : "This release does not include an iOS IPA.")
          : `${latest.ipa.name} · ${formatByteCount(latest.ipa.size)}`,
        actions: choices.map(item => ({ label: item.label })),
      })
      const selected = choice == null ? null : choices[choice]?.id
      if (selected === "notes") await Safari.present(latest.pageUrl, false)
      if (selected === "download") {
        const confirmed = await Dialog.confirm({
          title: T.downloadTitle,
          message: T.downloadBody,
          cancelLabel: T.cancel,
          confirmLabel: T.download,
        })
        if (!confirmed) return
        setBusy("download")
        setStatus(T.downloading)
        const path = await downloadVerifiedIPA(latest)
        setStatus(T.downloadReady)
        await DocumentInteraction.optionsMenu(path)
      }
    } catch (error) {
      await fail(error)
    } finally {
      setBusy(null)
    }
  }

  const persistSettings = (patch: Partial<SuiteSettings>) => {
    const next = { ...settings, ...patch }
    saveSettings(next)
    setSettings(next)
  }

  const changePerformanceProfile = (profile: PerformanceProfile) => {
    if (profile === settings.performanceProfile) return
    try {
      performanceProfileDidChange()
      persistSettings({ performanceProfile: profile })
      setModOptionRevision(modOptionRevision + 1)
    } catch (error) {
      void fail(error)
    }
  }

  const checkEverything = async (automatic = false) => {
    if (busy != null) return
    setBusy("update-check")
    setStatus(T.checkingEverything)
    const errors: string[] = []
    let engineRelease: EngineRelease | null = null
    let runtime: RuntimeSourceStatus | null = null
    const modUpdates: AvailableModUpdate[] = []
    try {
      const engineTask = checkEngineRelease().then(value => {
        engineRelease = value
      }).catch(error => {
        errors.push(`Gen1Recomp: ${error instanceof Error ? error.message : String(error)}`)
      })
      const runtimeTask = checkRuntimeSource().then(value => {
        runtime = value
      }).catch(error => {
        errors.push(`LÖVE Web: ${error instanceof Error ? error.message : String(error)}`)
      })
      const modTasks = loadModLibrary().mods
        .filter(mod => mod.sourceRepo != null)
        .map(mod => checkModRelease(mod.sourceRepo as string, mod.id).then(latest => {
          if (updateAvailable(mod, latest)) modUpdates.push({ mod, release: latest })
        }).catch(error => {
          errors.push(`${mod.name}: ${error instanceof Error ? error.message : String(error)}`)
        }))
      await Promise.all([engineTask, runtimeTask, ...modTasks])
      modUpdates.sort((left, right) => left.mod.name.localeCompare(right.mod.name))
      const checkedAt = new Date().toISOString()
      const overview: UpdateOverview = {
        engineRelease,
        engineAvailable: engineRelease != null && engineUpdateAvailable(engineRelease),
        runtime,
        modUpdates,
        errors,
        checkedAt,
      }
      setUpdates(overview)
      const nextSettings = { ...loadSettings(), lastUpdateCheck: checkedAt }
      saveSettings(nextSettings)
      setSettings(nextSettings)
      const count = (overview.engineAvailable ? 1 : 0) + modUpdates.length
      setStatus(count === 0 ? T.noUpdates : `${count} ${T.updatesFound}`)
      if (!automatic && errors.length > 0) {
        await Dialog.alert({
          title: T.checkedEverything,
          message: errors.slice(0, 8).join("\n\n"),
          buttonLabel: T.close,
        })
      }
    } catch (error) {
      if (automatic) setStatus(error instanceof Error ? error.message : String(error))
      else await fail(error)
    } finally {
      setBusy(null)
    }
  }

  const installAvailableEngine = async () => {
    const candidate = updates?.engineRelease
    if (candidate == null || !updates?.engineAvailable || busy != null) return
    const confirmed = await Dialog.confirm({
      title: `${T.installEngineUpdate} · v${candidate.version}`,
      message: `${candidate.assetName} · ${formatByteCount(candidate.size)}\n\nSHA-256\n${candidate.sha256}\n\nGitHub: ${candidate.pageUrl}`,
      cancelLabel: T.cancel,
      confirmLabel: T.update,
    })
    if (!confirmed) return
    setBusy("engine-install")
    setStatus(`${T.installEngineUpdate}…`)
    try {
      const next = await installEngineRelease(candidate)
      setComponents(next)
      setUpdates({ ...updates, engineAvailable: false })
      setStatus(`Gen1Recomp v${next.engineVersion} · ${T.current}`)
    } catch (error) {
      await fail(error)
    } finally {
      setBusy(null)
    }
  }

  const importLayer = async () => {
    if (busy != null) return
    const trusted = await Dialog.confirm({
      title: T.importExecutionLayer,
      message: T.executionLayerNotice,
      cancelLabel: T.cancel,
      confirmLabel: T.continue,
    })
    if (!trusted) return
    const selected = await DocumentPicker.pickFiles({
      types: ["public.data", "public.zip-archive"],
      allowsMultipleSelection: false,
      shouldShowFileExtensions: true,
    })
    if (selected.length === 0) {
      DocumentPicker.stopAcessingSecurityScopedResources()
      return
    }
    setBusy("layer-import")
    setStatus(`${T.importExecutionLayer}…`)
    try {
      const next = await installExecutionLayer(selected[0])
      setComponents(next)
      setStatus(`${T.executionLayerComponent} v${next.executionLayerVersion} · ${T.current}`)
    } catch (error) {
      await fail(error)
    } finally {
      DocumentPicker.stopAcessingSecurityScopedResources()
      setBusy(null)
    }
  }

  const importRuntime = async () => {
    if (busy != null) return
    const trusted = await Dialog.confirm({
      title: T.importRuntimeBundle,
      message: T.runtimeBundleNotice,
      cancelLabel: T.cancel,
      confirmLabel: T.continue,
    })
    if (!trusted) return
    const selected = await DocumentPicker.pickFiles({
      types: ["public.zip-archive"],
      allowsMultipleSelection: false,
      shouldShowFileExtensions: true,
    })
    if (selected.length === 0) {
      DocumentPicker.stopAcessingSecurityScopedResources()
      return
    }
    setBusy("runtime-import")
    setStatus(`${T.importRuntimeBundle}…`)
    try {
      const next = installRuntimeBundle(selected[0])
      setComponents(next)
      setStatus(`LÖVE ${next.runtimeVersion} · ${T.current}`)
    } catch (error) {
      await fail(error)
    } finally {
      DocumentPicker.stopAcessingSecurityScopedResources()
      setBusy(null)
    }
  }

  const restoreBundledEngine = async () => {
    if (components.engineSource !== "installed" || busy != null) return
    const confirmed = await Dialog.confirm({
      title: T.resetEngine,
      message: isGerman ? "Die installierte Engine-Überschreibung wird entfernt." : "The installed engine override will be removed.",
      cancelLabel: T.cancel,
      confirmLabel: T.remove,
    })
    if (!confirmed) return
    try {
      const next = resetEngineComponent()
      setComponents(next)
      setStatus(`Gen1Recomp v${next.engineVersion} · ${T.bundled}`)
    } catch (error) {
      await fail(error)
    }
  }

  const restoreGeneratedLayer = async () => {
    if (components.executionLayerSource !== "installed" || busy != null) return
    const confirmed = await Dialog.confirm({
      title: T.resetExecutionLayer,
      message: isGerman
        ? "Die separat installierte Lua-Ausführungsschicht wird entfernt. Der unveränderte Core bleibt erhalten."
        : "The separately installed Lua execution layer will be removed. The immutable core is unchanged.",
      cancelLabel: T.cancel,
      confirmLabel: T.remove,
    })
    if (!confirmed) return
    try {
      const next = resetExecutionLayer()
      setComponents(next)
      setStatus(`${T.executionLayerComponent} v${next.executionLayerVersion} · ${T.current}`)
    } catch (error) {
      await fail(error)
    }
  }

  const restoreBundledRuntime = async () => {
    if (components.runtimeSource !== "installed" || busy != null) return
    const confirmed = await Dialog.confirm({
      title: T.resetRuntime,
      message: isGerman ? "Die installierte Runtime-Überschreibung wird entfernt." : "The installed runtime override will be removed.",
      cancelLabel: T.cancel,
      confirmLabel: T.remove,
    })
    if (!confirmed) return
    try {
      const next = resetWebRuntime()
      setComponents(next)
      setStatus(`LÖVE ${next.runtimeVersion} · ${T.bundled}`)
    } catch (error) {
      await fail(error)
    }
  }

  const updateAllAvailableMods = async () => {
    if (busy != null || updates == null || updates.modUpdates.length === 0) return
    const confirmed = await Dialog.confirm({
      title: T.updateAllMods,
      message: updates.modUpdates.map(item => `${item.mod.name}: ${item.mod.version} → ${item.release.version}`).join("\n"),
      cancelLabel: T.cancel,
      confirmLabel: T.update,
    })
    if (!confirmed) return
    setBusy("mods-update-all")
    const failures: string[] = []
    const completed = new Set<string>()
    let downloadControlled = false
    try {
      for (const item of updates.modUpdates) {
        setStatus(`${item.mod.name} · ${T.modDownloading}`)
        try {
          const prepared = await downloadAndPrepareMod(
            item.release,
            progress => setStatus(modPreparationStatus(item.mod.name, progress)),
          )
          try {
            const next = installPreparedMod(prepared, item.mod.id)
            refreshMods(next)
            completed.add(item.mod.id)
          } finally {
            discardPreparedMod(prepared)
          }
        } catch (error) {
          if (isDownloadControlError(error)) {
            downloadControlled = true
            setStatus(error.message)
            break
          }
          failures.push(`${item.mod.name}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      setUpdates({ ...updates, modUpdates: updates.modUpdates.filter(item => !completed.has(item.mod.id)) })
      if (!downloadControlled) setStatus(failures.length === 0 ? T.checkedEverything : `${completed.size}/${updates.modUpdates.length} ${T.modUpdated}`)
      if (failures.length > 0) {
        await Dialog.alert({ title: T.error, message: failures.join("\n\n"), buttonLabel: T.close })
      }
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => subscribeDownloads(setDownloads), [])

  useEffect(() => {
    if (automaticUpdateCheckDue(settings)) void checkEverything(true)
  }, [])

  const diagnosticMetadata = () => {
    const currentSettings = loadSettings()
    const currentMods = loadModLibrary()
    return {
      project: "Gen1Recomp Native Suite",
      version: SUITE_VERSION,
      components: activeComponentStatus(),
      settings: {
        performanceProfile: currentSettings.performanceProfile,
        saveSyncSeconds: currentSettings.saveSyncSeconds,
        automaticUpdateChecks: currentSettings.automaticUpdateChecks,
        updateCheckIntervalHours: currentSettings.updateCheckIntervalHours,
        lastUpdateCheck: currentSettings.lastUpdateCheck ?? null,
        lastPerformance: currentSettings.lastPerformance ?? null,
      },
      library: library.games.map(game => ({
        edition: game.edition,
        support: game.recompSupport,
        playCount: game.playCount,
        lastPlayedAt: game.lastPlayedAt ?? null,
      })),
      mods: currentMods.mods.map(mod => ({
        id: mod.id,
        name: mod.name,
        version: mod.version,
        enabled: mod.enabled,
        bytes: mod.byteLength,
        files: mod.fileCount,
        storage: mod.storage ?? "directory",
        permissions: mod.permissions,
        dependencies: mod.dependencies,
        conflicts: mod.conflicts,
        sourceRepo: mod.sourceRepo ?? null,
        optionRows: mod.optionSchema?.rows.length ?? 0,
        optionSchemaOrigin: mod.optionSchema?.origin ?? null,
        optionsScannedVersion: mod.optionsScannedVersion ?? null,
      })),
      modHealth: modHealthIssues(currentMods),
      downloads: loadDownloadRecords().map(item => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        status: item.status,
        downloadedBytes: item.downloadedBytes,
        totalBytes: item.totalBytes,
        attempt: item.attempt,
        resumable: item.resumable,
        error: item.error ?? null,
        updatedAt: item.updatedAt,
      })),
      updateStatus: updates == null ? null : {
        checkedAt: updates.checkedAt,
        engineAvailable: updates.engineAvailable,
        modUpdates: updates.modUpdates.map(item => ({ id: item.mod.id, version: item.release.version })),
        failedChecks: updates.errors.length,
        runtimeSourceChanged: updates.runtime?.changed ?? null,
      },
    }
  }

  const exportDiagnostics = async () => {
    const confirmed = await Dialog.confirm({
      title: T.exportDiagnostics,
      message: T.diagnosticsBody,
      cancelLabel: T.cancel,
      confirmLabel: T.continue,
    })
    if (!confirmed) return
    const formats: Array<{ format: DiagnosticExportFormat; label: string }> = [
      { format: "txt", label: T.diagnosticsTXT },
      { format: "json", label: T.diagnosticsJSON },
      { format: "jsonl", label: T.diagnosticsJSONL },
      { format: "csv", label: T.diagnosticsCSV },
    ]
    const choice = await Dialog.actionSheet({
      title: T.diagnosticsFormat,
      message: T.diagnosticsFormatBody,
      actions: formats.map(item => ({ label: item.label })),
    })
    const format = choice == null ? null : formats[choice]?.format
    if (format == null) return
    setBusy("diagnostics-export")
    let path: string | null = null
    try {
      recordDiagnostic(DASHBOARD_DIAGNOSTIC_SESSION, "dashboard", "info", "diagnostics_export_requested", format)
      path = await createDiagnosticExport(format, diagnosticMetadata())
      setDiagnostics(diagnosticSummary())
      setStatus(T.diagnosticsReady)
      await DocumentInteraction.optionsMenu(path)
    } catch (error) {
      await fail(error)
    } finally {
      if (path != null && FileManager.existsSync(path)) FileManager.removeSync(path)
      setBusy(null)
    }
  }

  const clearConsoleDiagnostics = async () => {
    const confirmed = await Dialog.confirm({
      title: T.clearDiagnostics,
      message: T.clearDiagnosticsBody,
      cancelLabel: T.cancel,
      confirmLabel: T.clear,
    })
    if (!confirmed) return
    await clearDiagnostics()
    setDiagnostics(diagnosticSummary())
    setStatus(T.diagnosticsCleared)
  }

  const showAbout = async () => {
    await Dialog.alert({
      title: T.privacyTitle,
      message: `${T.privacyBody}\n\n${T.saveBody}\n\n${T.licenceBody}`,
      buttonLabel: T.close,
    })
  }

  const gameCount = library.games.length
  const countLabel = `${gameCount} ${gameCount === 1 ? T.game : T.games}`
  const activeModCount = mods.mods.filter(mod => mod.enabled).length
  const modCountLabel = `${mods.mods.length} ${T.installedMods} · ${activeModCount} ${T.activeMods}`
  const modFileCount = mods.mods.reduce((sum, mod) => sum + mod.fileCount, 0)
  const modByteCount = mods.mods.reduce((sum, mod) => sum + mod.byteLength, 0)
  const currentModHealthIssues = modHealthIssues(mods)
  const editingMod = editingModOptions == null ? null : mods.mods.find(mod => mod.id === editingModOptions) ?? null
  const latestModDownload = downloads.find(item => item.kind === "mod") ?? null
  const recentGame = [...library.games].sort((left, right) =>
    (right.lastPlayedAt ?? right.importedAt).localeCompare(left.lastPlayedAt ?? left.importedAt))[0]
  const updateCount = (updates?.engineAvailable ? 1 : 0) + (updates?.modUpdates.length ?? 0)
  const profileBody = settings.performanceProfile === "efficient" ? T.profileEfficientBody
    : settings.performanceProfile === "quality" ? T.profileQualityBody : T.profileBalancedBody
  const profileLabel = settings.performanceProfile === "efficient" ? T.profileEfficient
    : settings.performanceProfile === "quality" ? T.profileQuality : T.profileBalanced
  const metric = settings.lastPerformance
  const metricSummary = metric == null ? T.noMeasurement
    : `${metric.fps.toFixed(1)} FPS · ${metric.slowFramePercent.toFixed(1)}% >25 ms · ${metric.worstFrameMs.toFixed(0)} ms ${isGerman ? "Maximum" : "worst"}`
  const diagnosticSummaryText = `${diagnostics.entries} ${T.diagnosticsEntries} · ${diagnostics.sessions} ${T.diagnosticsSessions} · ${diagnostics.errors} ${T.diagnosticsErrors} · ${formatByteCount(diagnostics.bytes)}`
  const diagnosticLastError = diagnostics.lastErrorMessage == null
    ? T.diagnosticsNoError
    : `${T.diagnosticsLastError}: ${diagnostics.lastErrorMessage.length > 1200 ? `${diagnostics.lastErrorMessage.slice(0, 1200)}…` : diagnostics.lastErrorMessage}`

  return (
    <NavigationStack>
      <TabView tabIndex={tabIndex} onTabIndexChanged={setTabIndex}>
        <ScrollView
          tag={0}
          tabItem={<Label title={T.dashboard} systemImage="sparkles" />}
          navigationTitle={T.title}
          navigationBarTitleDisplayMode="inline"
          toolbar={{ topBarLeading: <Button title={T.close} systemImage="xmark" action={dismiss} /> }}
        >
          <VStack alignment="leading" spacing={22} padding={{ horizontal: 16, top: 12, bottom: 34 }}>
            <RoundedRectangle
              fill={{ color: "#7457F5", gradient: true }}
              cornerRadius={28}
              frame={{ maxWidth: "infinity", height: 254 }}
              overlay={
                <VStack alignment="leading" spacing={10} padding={20} foregroundStyle="white">
                  <HStack>
                    <Text font="caption" fontWeight="bold">{T.eyebrow}</Text>
                    <Spacer />
                    <Image systemName="bolt.shield.fill" />
                  </HStack>
                  <Spacer />
                  <Text font={{ name: "system", size: 31 }} fontWeight="bold">{T.heroTitle}</Text>
                  <Text font="subheadline" foregroundStyle="#ECE8FF" lineLimit={3}>{T.dashboardSummary}</Text>
                  <HStack spacing={10}>
                    {recentGame == null ? (
                      <Button title={T.importGames} systemImage="plus.circle.fill" action={importGames} buttonStyle="borderedProminent" buttonBorderShape="capsule" />
                    ) : (
                      <Button title={T.continuePlaying} systemImage="play.fill" action={() => playGame(recentGame)} buttonStyle="borderedProminent" buttonBorderShape="capsule" />
                    )}
                    <Text font="caption" fontWeight="semibold">{countLabel}</Text>
                  </HStack>
                </VStack>
              }
            />

            {status !== "" || busy != null ? (
              <RoundedRectangle
                fill="tertiarySystemBackground"
                cornerRadius={16}
                frame={{ maxWidth: "infinity", height: 56 }}
                overlay={
                  <HStack spacing={10} padding={{ horizontal: 14 }}>
                    {busy != null ? <ProgressView /> : <Image systemName="checkmark.circle.fill" foregroundStyle="green" />}
                    <Text font="subheadline" fontWeight="medium" lineLimit={2}>{status || T.statusLocal}</Text>
                    <Spacer />
                  </HStack>
                }
              />
            ) : null}

            {recentGame != null ? (
              <VStack alignment="leading" spacing={12} frame={{ maxWidth: "infinity" }}>
                <HStack>
                  <Text font="title2" fontWeight="bold">{T.continuePlaying}</Text>
                  <Spacer />
                  <Button title={T.gamesTab} action={() => setTabIndex(1)} />
                </HStack>
                <LazyVGrid
                  columns={[{ size: { type: "adaptive", min: 150, max: 224 }, spacing: 14, alignment: "top" }]}
                  alignment="leading"
                  spacing={14}
                >
                  <GameCard game={recentGame} action={() => gameMenu(recentGame)} />
                </LazyVGrid>
              </VStack>
            ) : null}

            <VStack alignment="leading" spacing={12} frame={{ maxWidth: "infinity" }}>
              <Text font="title2" fontWeight="bold">{T.performance}</Text>
              <Button action={() => setTabIndex(3)} buttonStyle="plain">
                <RoundedRectangle
                  fill="secondarySystemBackground"
                  cornerRadius={22}
                  frame={{ maxWidth: "infinity", height: 132 }}
                  overlay={
                    <HStack spacing={15} padding={17}>
                      <RoundedRectangle fill="#173A32" cornerRadius={15} frame={{ width: 58, height: 58 }} overlay={<Image systemName="speedometer" foregroundStyle="#5FE1B1" font={{ name: "system", size: 27 }} />} />
                      <VStack alignment="leading" spacing={5}>
                        <Text font="headline" fontWeight="bold">{profileLabel}</Text>
                        <Text font="footnote" foregroundStyle="secondary" lineLimit={3}>{metricSummary}</Text>
                      </VStack>
                      <Spacer />
                      <Image systemName="chevron.right" foregroundStyle="secondary" />
                    </HStack>
                  }
                />
              </Button>
            </VStack>

            <VStack alignment="leading" spacing={12} frame={{ maxWidth: "infinity" }}>
              <Text font="title2" fontWeight="bold">{T.updateCenter}</Text>
              <Button action={() => setTabIndex(3)} buttonStyle="plain">
                <RoundedRectangle
                  fill="secondarySystemBackground"
                  cornerRadius={22}
                  frame={{ maxWidth: "infinity", height: 132 }}
                  overlay={
                    <HStack spacing={15} padding={17}>
                      <RoundedRectangle fill="#251E4A" cornerRadius={15} frame={{ width: 58, height: 58 }} overlay={<Image systemName="arrow.triangle.2.circlepath.circle.fill" foregroundStyle="#A996FF" font={{ name: "system", size: 28 }} />} />
                      <VStack alignment="leading" spacing={5}>
                        <Text font="headline" fontWeight="bold">{updateCount > 0 ? `${updateCount} ${T.updatesFound}` : T.updateCenter}</Text>
                        <Text font="footnote" foregroundStyle="secondary" lineLimit={3}>{updates == null ? T.updateCenterBody : `${T.checkedEverything} · ${dateText(updates.checkedAt)}`}</Text>
                      </VStack>
                      <Spacer />
                      <Image systemName="chevron.right" foregroundStyle="secondary" />
                    </HStack>
                  }
                />
              </Button>
            </VStack>

            <RoundedRectangle
              fill="secondarySystemBackground"
              cornerRadius={20}
              frame={{ maxWidth: "infinity", height: 116 }}
              overlay={
                <HStack spacing={14} padding={16}>
                  <Image systemName="lock.shield.fill" foregroundStyle="#7457F5" font={{ name: "system", size: 28 }} />
                  <VStack alignment="leading" spacing={5}>
                    <Text font="headline" fontWeight="semibold">{T.statusLocal}</Text>
                    <Text font="footnote" foregroundStyle="secondary" lineLimit={3}>{T.emptyStatus} {T.networkHint}</Text>
                  </VStack>
                  <Spacer />
                </HStack>
              }
            />
          </VStack>
        </ScrollView>

        <ScrollView
          tag={1}
          tabItem={<Label title={T.gamesTab} systemImage="rectangle.stack.fill" />}
          navigationTitle={T.library}
          navigationBarTitleDisplayMode="inline"
          toolbar={{ topBarLeading: <Button title={T.close} systemImage="xmark" action={dismiss} />, primaryAction: <Button title={T.importGames} systemImage="plus" action={importGames} /> }}
        >
          <VStack alignment="leading" spacing={20} padding={{ horizontal: 16, top: 12, bottom: 34 }}>
            <HStack>
              <VStack alignment="leading" spacing={3}>
                <Text font="largeTitle" fontWeight="bold">{T.library}</Text>
                <Text font="subheadline" foregroundStyle="secondary">{countLabel}</Text>
              </VStack>
              <Spacer />
              <Button title={T.importGames} systemImage="plus.circle.fill" action={importGames} buttonStyle="borderedProminent" buttonBorderShape="capsule" />
            </HStack>
            {status !== "" || busy != null ? (
              <HStack spacing={10} padding={13} background="tertiarySystemBackground" cornerRadius={15}>
                {busy != null ? <ProgressView /> : <Image systemName="checkmark.circle.fill" foregroundStyle="green" />}
                <Text font="subheadline" lineLimit={2}>{status || T.statusLocal}</Text>
                <Spacer />
              </HStack>
            ) : null}
            {gameCount === 0 ? (
              <RoundedRectangle
                fill="secondarySystemBackground"
                cornerRadius={24}
                frame={{ maxWidth: "infinity", height: 300 }}
                overlay={
                  <VStack spacing={12} padding={24}>
                    <Image systemName="rectangle.stack.badge.plus" foregroundStyle="#7457F5" font={{ name: "system", size: 48 }} />
                    <Text font="title3" fontWeight="bold">{T.noGames}</Text>
                    <Text font="subheadline" foregroundStyle="secondary" lineLimit={5}>{T.noGamesBody}</Text>
                    <Button title={T.chooseFiles} systemImage="doc.badge.plus" action={importGames} buttonStyle="bordered" buttonBorderShape="capsule" />
                  </VStack>
                }
              />
            ) : (
              <LazyVGrid
                columns={[{ size: { type: "adaptive", min: 150, max: 224 }, spacing: 14, alignment: "top" }]}
                alignment="leading"
                spacing={20}
              >
                {library.games.map(game => <GameCard game={game} action={() => gameMenu(game)} />)}
              </LazyVGrid>
            )}
            <Text font="footnote" foregroundStyle="secondary">{T.firstLaunch}</Text>
          </VStack>
        </ScrollView>

        <ScrollView
          tag={2}
          badge={updates?.modUpdates.length || undefined}
          tabItem={<Label title={T.appStore} systemImage="app.badge.fill" />}
          navigationTitle={editingMod?.name ?? T.appStore}
          navigationBarTitleDisplayMode="inline"
          toolbar={{ topBarLeading:
            <Button
              title={editingMod == null ? T.close : T.back}
              systemImage={editingMod == null ? "xmark" : "chevron.left"}
              action={editingMod == null ? dismiss : () => setEditingModOptions(null)}
            /> }}
        >
          {editingMod == null ? (
          <VStack alignment="leading" spacing={22} padding={{ horizontal: 16, top: 12, bottom: 40 }}>
            <HStack alignment="center">
              <VStack alignment="leading" spacing={3}>
                <Text font="largeTitle" fontWeight="bold">{T.appStore}</Text>
                <Text font="subheadline" foregroundStyle="secondary">{T.storefrontSubtitle}</Text>
              </VStack>
              <Spacer />
              <Button title={T.checkEverything} systemImage="arrow.clockwise" action={() => checkEverything()} buttonStyle="bordered" buttonBorderShape="capsule" />
            </HStack>
            {status !== "" || busy != null ? (
              <HStack spacing={10} padding={13} background="tertiarySystemBackground" cornerRadius={15}>
                {busy != null ? <ProgressView /> : <Image systemName="checkmark.circle.fill" foregroundStyle="green" />}
                <Text font="subheadline" lineLimit={2}>{status || T.statusLocal}</Text>
                <Spacer />
              </HStack>
            ) : null}
            {latestModDownload == null ? null : managedDownloadPanel(latestModDownload)}
            <VStack alignment="leading" spacing={12}>
              <Text font="title2" fontWeight="bold">{T.featured}</Text>
              <RoundedRectangle
                fill={{ color: "#251E4A", gradient: true }}
                cornerRadius={26}
                frame={{ maxWidth: "infinity", height: 210 }}
                overlay={
                  <VStack alignment="leading" spacing={12} padding={20} foregroundStyle="white">
                    <HStack>
                      <Image systemName="cube.transparent.fill" foregroundStyle="#B9AAFF" font={{ name: "system", size: 34 }} />
                      <Spacer />
                      <Text font="caption" fontWeight="semibold" foregroundStyle="#D7CFFF">EDITOR CHOICE</Text>
                    </HStack>
                    <Spacer />
                    <VStack alignment="leading" spacing={4}>
                      <Text font="title3" fontWeight="bold">{T.dramaticShape}</Text>
                      <Text font="footnote" foregroundStyle="#D7CFFF" lineLimit={2}>{T.dramaticBody}</Text>
                    </VStack>
                    <HStack spacing={12}>
                      <Button title={mods.mods.some(mod => mod.id === "DRAMATIC_SHAPE") ? T.open : T.get} systemImage="arrow.down.circle.fill" action={dramaticShape} buttonStyle="borderedProminent" buttonBorderShape="capsule" />
                      <Button title={T.importMod} systemImage="square.and.arrow.down" action={importMods} buttonStyle="bordered" buttonBorderShape="capsule" />
                    </HStack>
                  </VStack>
                }
              />
            </VStack>
            <VStack alignment="leading" spacing={12}>
              <HStack>
                <Text font="title2" fontWeight="bold">{T.updatesSection}</Text>
                <Spacer />
                {updates != null && updates.modUpdates.length > 0 ? (
                  <Button title={T.updateAllMods} systemImage="arrow.down.circle.fill" action={updateAllAvailableMods} buttonStyle="borderedProminent" buttonBorderShape="capsule" />
                ) : null}
              </HStack>
              {updates == null || (updates.modUpdates.length === 0 && !updates.engineAvailable && updates.runtime?.available == null) ? (
                <RoundedRectangle fill="secondarySystemBackground" cornerRadius={18} frame={{ maxWidth: "infinity", height: 76 }} overlay={
                  <HStack spacing={12} padding={16}>
                    <Image systemName="checkmark.seal.fill" foregroundStyle="green" font={{ name: "system", size: 24 }} />
                    <VStack alignment="leading" spacing={2}>
                      <Text font="subheadline" fontWeight="semibold">All Apps Are Up to Date</Text>
                      <Text font="caption" foregroundStyle="secondary">{T.checkedEverything}</Text>
                    </VStack>
                    <Spacer />
                  </HStack>
                } />
              ) : (
                <VStack spacing={8}>
                  {updates.engineAvailable && updates.engineRelease != null ? (
                    <RoundedRectangle fill="secondarySystemBackground" cornerRadius={18} frame={{ maxWidth: "infinity", height: 82 }} overlay={
                      <HStack spacing={14} padding={16}>
                        <Image systemName="gearshape.2.fill" foregroundStyle="#7457F5" font={{ name: "system", size: 26 }} />
                        <VStack alignment="leading" spacing={2}>
                          <Text font="subheadline" fontWeight="semibold">{T.engineComponent}</Text>
                          <Text font="caption" foregroundStyle="secondary">v{updates.engineRelease.version} · {formatByteCount(updates.engineRelease.size)}</Text>
                        </VStack>
                        <Spacer />
                        <Button title={T.update} systemImage="arrow.down" action={installAvailableEngine} buttonStyle="borderedProminent" buttonBorderShape="capsule" />
                      </HStack>
                    } />
                  ) : null}
                  {updates.modUpdates.map(item => (
                    <RoundedRectangle fill="secondarySystemBackground" cornerRadius={18} frame={{ maxWidth: "infinity", height: 82 }} overlay={
                      <HStack spacing={14} padding={16}>
                        <Image systemName="puzzlepiece.extension.fill" foregroundStyle="#7457F5" font={{ name: "system", size: 26 }} />
                        <VStack alignment="leading" spacing={2}>
                          <Text font="subheadline" fontWeight="semibold">{item.mod.name}</Text>
                          <Text font="caption" foregroundStyle="secondary">v{item.mod.version} → v{item.release.version}</Text>
                        </VStack>
                        <Spacer />
                        <Button title={T.update} systemImage="arrow.down" action={() => updateMod(item.mod)} buttonStyle="borderedProminent" buttonBorderShape="capsule" />
                      </HStack>
                    } />
                  ))}
                </VStack>
              )}
            </VStack>
            <VStack alignment="leading" spacing={12}>
              <Text font="title2" fontWeight="bold">{T.installedMods}</Text>
              {mods.mods.length === 0 ? (
                <RoundedRectangle fill="secondarySystemBackground" cornerRadius={22} frame={{ maxWidth: "infinity", height: 144 }} overlay={
                  <VStack spacing={8} padding={20}>
                    <Image systemName="puzzlepiece.extension" foregroundStyle="secondary" font={{ name: "system", size: 30 }} />
                    <Text font="headline" fontWeight="semibold">{T.noMods}</Text>
                    <Text font="footnote" foregroundStyle="secondary" lineLimit={2}>{T.modsBody}</Text>
                  </VStack>
                } />
              ) : mods.mods.map(mod => (
                <Button action={() => modMenu(mod)} buttonStyle="plain">
                  <RoundedRectangle
                    fill="secondarySystemBackground"
                    cornerRadius={20}
                    frame={{ maxWidth: "infinity", height: 116 }}
                    overlay={
                      <HStack spacing={14} padding={15}>
                        <RoundedRectangle fill={mod.enabled ? "#173A32" : "tertiarySystemBackground"} cornerRadius={14} frame={{ width: 52, height: 52 }} overlay={<Image systemName={mod.enabled ? "checkmark.circle.fill" : "circle"} foregroundStyle={mod.enabled ? "#5FE1B1" : "secondary"} font={{ name: "system", size: 25 }} />} />
                        <VStack alignment="leading" spacing={4}>
                          <Text font="headline" fontWeight="semibold" lineLimit={1}>{mod.name}</Text>
                          <Text font="caption" foregroundStyle="secondary" lineLimit={1}>v{mod.version} · {formatByteCount(mod.byteLength)} · {mod.fileCount} files</Text>
                          <Text font="caption" foregroundStyle={mod.enabled ? "green" : "secondary"} lineLimit={1}>{mod.enabled ? "Active" : "Inactive"} · {mod.storage === "archive" ? T.modPacked : T.modLegacy} · {mod.optionSchema?.rows.length ?? 0} {T.modSettingsCount}</Text>
                        </VStack>
                        <Spacer />
                        <Button title={T.open} action={() => modMenu(mod)} buttonStyle="bordered" buttonBorderShape="capsule" />
                      </HStack>
                    }
                  />
                </Button>
              ))}
            </VStack>
            <VStack spacing={12}>
              <Button action={installFromGitHub} buttonStyle="plain">
                <HStack spacing={11} padding={14} frame={{ maxWidth: "infinity" }} background="secondarySystemBackground" cornerRadius={16}>
                  <Image systemName="link.badge.plus" foregroundStyle="#5AA9FF" />
                  <VStack alignment="leading" spacing={3}>
                    <Text font="subheadline" fontWeight="semibold">{T.installFromGitHub}</Text>
                    <Text font="caption" foregroundStyle="secondary" lineLimit={2}>{T.installFromGitHubBody}</Text>
                  </VStack>
                  <Spacer />
                  <Image systemName="chevron.right" foregroundStyle="secondary" />
                </HStack>
              </Button>
              <Button action={showModHealth} buttonStyle="plain">
                <RoundedRectangle
                  fill="secondarySystemBackground"
                  cornerRadius={20}
                  frame={{ maxWidth: "infinity", height: 122 }}
                  overlay={
                    <HStack spacing={14} padding={16}>
                      <RoundedRectangle
                        fill={currentModHealthIssues.length === 0 ? "#173A32" : "#4A3518"}
                        cornerRadius={14}
                        frame={{ width: 52, height: 52 }}
                        overlay={<Image systemName={currentModHealthIssues.length === 0 ? "checkmark.shield.fill" : "exclamationmark.shield.fill"} foregroundStyle={currentModHealthIssues.length === 0 ? "#5FE1B1" : "orange"} font={{ name: "system", size: 24 }} />}
                      />
                      <VStack alignment="leading" spacing={5}>
                        <Text font="headline" fontWeight="semibold">{currentModHealthIssues.length === 0 ? T.modHealthReady : `${currentModHealthIssues.length} ${T.modHealthIssues}`}</Text>
                        <Text font="caption" foregroundStyle="secondary" lineLimit={2}>{T.modStorage}: {formatByteCount(modByteCount)} · {modFileCount} files</Text>
                      </VStack>
                      <Spacer />
                      <Image systemName="chevron.right" foregroundStyle="secondary" />
                    </HStack>
                  }
                />
              </Button>
              <Button action={showLoadReportHelp} buttonStyle="plain">
                <HStack spacing={10} padding={13} frame={{ maxWidth: "infinity" }} background="tertiarySystemBackground" cornerRadius={15}>
                  <Image systemName="doc.text.magnifyingglass" foregroundStyle="#7457F5" />
                  <Text font="subheadline" fontWeight="medium">{T.loadReportTitle}</Text>
                  <Spacer />
                  <Image systemName="info.circle" foregroundStyle="secondary" />
                </HStack>
              </Button>
            </VStack>
            <Text font="footnote" foregroundStyle="secondary">{T.modSecurityBody}</Text>
          </VStack>
          ) : (
            <VStack alignment="leading" spacing={18} padding={{ horizontal: 16, top: 12, bottom: 34 }}>
              <HStack frame={{ maxWidth: "infinity" }}>
                <Button
                  title={T.back}
                  systemImage="chevron.left"
                  action={() => setEditingModOptions(null)}
                  buttonStyle="borderedProminent"
                  buttonBorderShape="capsule"
                />
                <Spacer />
                <Button title={T.close} systemImage="xmark" action={dismiss} buttonStyle="bordered" buttonBorderShape="capsule" />
              </HStack>
              <VStack alignment="leading" spacing={5}>
                <Text font="largeTitle" fontWeight="bold">{editingMod.name}</Text>
                <Text font="subheadline" foregroundStyle="secondary">
                  v{editingMod.version} · {editingMod.optionSchema?.rows.length ?? 0} {T.modSettingsCount}
                </Text>
              </VStack>
              <VStack alignment="leading" spacing={7} padding={15} frame={{ maxWidth: "infinity" }} background="tertiarySystemBackground" cornerRadius={16}>
                <HStack spacing={8}>
                  <Image systemName="checkmark.shield.fill" foregroundStyle="#5FE1B1" />
                  <Text font="subheadline" fontWeight="semibold">{T.modSettings}</Text>
                  <Spacer />
                </HStack>
                <Text font="caption" foregroundStyle="secondary" lineLimit={5}>
                  {editingMod.optionSchema?.origin === "declarative" ? T.modSettingsDeclarative : T.modSettingsRuntime}
                </Text>
                <Text font="caption" foregroundStyle="secondary" lineLimit={4}>{T.modSettingsApply}</Text>
              </VStack>
              <VStack alignment="leading" spacing={12} frame={{ maxWidth: "infinity" }}>
                {(editingMod.optionSchema?.rows ?? []).map(row => {
                  const value = modOptionValue(editingMod, row, settings.performanceProfile)
                  return (
                    <VStack alignment="leading" spacing={7} padding={15} frame={{ maxWidth: "infinity" }} background="secondarySystemBackground" cornerRadius={17}>
                      {row.type === "toggle" ? (
                        <Toggle
                          title={row.label}
                          value={value === true}
                          onChanged={(selected: boolean) => commitModOption(editingMod, row, selected)}
                        />
                      ) : (
                        <Button action={() => editModOption(editingMod, row)} buttonStyle="plain">
                          <HStack spacing={10} frame={{ maxWidth: "infinity" }}>
                            <VStack alignment="leading" spacing={3}>
                              <Text font="headline" fontWeight="semibold">{row.label}</Text>
                              <Text font="subheadline" foregroundStyle="#7457F5" lineLimit={2}>
                                {modOptionDisplayValue(row, value)}
                              </Text>
                            </VStack>
                            <Spacer />
                            <Image systemName="chevron.right" foregroundStyle="secondary" />
                          </HStack>
                        </Button>
                      )}
                      {row.description == null ? null : (
                        <Text font="caption" foregroundStyle="secondary" lineLimit={5}>{row.description}</Text>
                      )}
                    </VStack>
                  )
                })}
              </VStack>
              <Button
                title={T.restoreModDefaults}
                systemImage="arrow.counterclockwise.circle.fill"
                action={() => restoreModDefaults(editingMod)}
                buttonStyle="bordered"
                buttonBorderShape="capsule"
              />
              <Text font="footnote" foregroundStyle="secondary">{T.modRestart}</Text>
            </VStack>
          )}
        </ScrollView>

        <ScrollView
          tag={3}
          badge={updateCount || undefined}
          tabItem={<Label title={T.settingsTab} systemImage="gearshape.fill" />}
          navigationTitle={T.settingsTab}
          navigationBarTitleDisplayMode="inline"
          toolbar={{ topBarLeading: <Button title={T.close} systemImage="xmark" action={dismiss} /> }}
        >
          <VStack alignment="leading" spacing={24} padding={{ horizontal: 16, top: 12, bottom: 34 }}>
            <VStack alignment="leading" spacing={4}>
              <Text font="largeTitle" fontWeight="bold">{T.settingsTab}</Text>
              <Text font="subheadline" foregroundStyle="secondary">{T.performance} · {T.updateCenter} · {T.privacyTitle}</Text>
            </VStack>
            {status !== "" || busy != null ? (
              <HStack spacing={10} padding={13} background="tertiarySystemBackground" cornerRadius={15}>
                {busy != null ? <ProgressView /> : <Image systemName="checkmark.circle.fill" foregroundStyle="green" />}
                <Text font="subheadline" lineLimit={2}>{status || T.statusLocal}</Text>
                <Spacer />
              </HStack>
            ) : null}

            <VStack alignment="leading" spacing={12} frame={{ maxWidth: "infinity" }}>
              <HStack>
                <VStack alignment="leading" spacing={3}>
                  <Text font="title2" fontWeight="bold">{T.downloadManager}</Text>
                  <Text font="subheadline" foregroundStyle="secondary">{T.downloadManagerBody}</Text>
                </VStack>
                <Spacer />
                <Image systemName="arrow.down.circle.fill" foregroundStyle="#7457F5" />
              </HStack>
              {downloads.length === 0 ? (
                <VStack alignment="leading" spacing={6} padding={15} frame={{ maxWidth: "infinity" }} background="secondarySystemBackground" cornerRadius={18}>
                  <Text font="headline" fontWeight="semibold">{T.noDownloads}</Text>
                  <Text font="footnote" foregroundStyle="secondary">{T.noDownloadsBody}</Text>
                </VStack>
              ) : downloads.slice(0, 8).map(item => managedDownloadPanel(item))}
              <Text font="footnote" foregroundStyle="secondary">{T.downloadPartialNotice}</Text>
            </VStack>

            <VStack alignment="leading" spacing={12} frame={{ maxWidth: "infinity" }}>
              <Text font="title2" fontWeight="bold">{T.performance}</Text>
              <VStack
                alignment="leading"
                spacing={12}
                padding={17}
                frame={{ maxWidth: "infinity" }}
                background="secondarySystemBackground"
                cornerRadius={22}
              >
                <Text font="headline" fontWeight="semibold">{T.performanceProfile}</Text>
                <Picker
                  title={T.performanceProfile}
                  value={settings.performanceProfile}
                  onChanged={(value: string) => changePerformanceProfile(value as PerformanceProfile)}
                  pickerStyle="segmented"
                >
                  <Text tag="efficient">{T.profileEfficient}</Text>
                  <Text tag="balanced">{T.profileBalanced}</Text>
                  <Text tag="quality">{T.profileQuality}</Text>
                </Picker>
                <Text font="footnote" foregroundStyle="secondary">{profileBody}</Text>
                <Text font="caption" foregroundStyle="#7457F5">{T.profileAppliedNextLaunch}</Text>
                <Text font="headline" fontWeight="semibold">{T.saveSync}</Text>
                <Picker
                  title={T.saveSync}
                  value={String(settings.saveSyncSeconds)}
                  onChanged={(value: string) => persistSettings({ saveSyncSeconds: Number(value) as 10 | 15 | 30 | 60 })}
                  pickerStyle="segmented"
                >
                  <Text tag="10">10 s</Text>
                  <Text tag="15">15 s</Text>
                  <Text tag="30">30 s</Text>
                  <Text tag="60">60 s</Text>
                </Picker>
              </VStack>
              <RoundedRectangle
                fill="secondarySystemBackground"
                cornerRadius={20}
                frame={{ maxWidth: "infinity", height: 118 }}
                overlay={
                  <HStack spacing={14} padding={16}>
                    <Image systemName="waveform.path.ecg.rectangle.fill" foregroundStyle="#5AA9FF" font={{ name: "system", size: 29 }} />
                    <VStack alignment="leading" spacing={5}>
                      <Text font="headline" fontWeight="semibold">{T.measuredPerformance}</Text>
                      <Text font="footnote" foregroundStyle="secondary" lineLimit={3}>{metricSummary}</Text>
                      {metric != null ? <Text font="caption" foregroundStyle="secondary">{dateText(metric.measuredAt)}</Text> : null}
                    </VStack>
                    <Spacer />
                  </HStack>
                }
              />
            </VStack>

            <VStack alignment="leading" spacing={12} frame={{ maxWidth: "infinity" }}>
              <Text font="title2" fontWeight="bold">{T.updateCenter}</Text>
              <Text font="subheadline" foregroundStyle="secondary">{T.updateCenterBody}</Text>
              <RoundedRectangle
                fill="secondarySystemBackground"
                cornerRadius={20}
                frame={{ maxWidth: "infinity", height: 128 }}
                overlay={
                  <HStack spacing={14} padding={16}>
                    <RoundedRectangle fill="#173A32" cornerRadius={14} frame={{ width: 52, height: 52 }} overlay={<Image systemName="shippingbox.fill" foregroundStyle="#5FE1B1" font={{ name: "system", size: 24 }} />} />
                    <VStack alignment="leading" spacing={4}>
                      <Text font="headline" fontWeight="semibold">{T.engineComponent}</Text>
                      <Text font="caption" foregroundStyle="secondary">v{components.engineVersion} · {components.engineSource === "bundled" ? T.bundled : T.installedComponent}</Text>
                      <Text font="caption" foregroundStyle={updates?.engineAvailable ? "orange" : "green"}>{updates?.engineAvailable ? `v${updates.engineRelease?.version} · ${T.updateAvailableLabel}` : T.current}</Text>
                    </VStack>
                    <Spacer />
                    {updates?.engineAvailable ? <Button title={T.update} action={installAvailableEngine} buttonStyle="borderedProminent" /> : null}
                  </HStack>
                }
              />
              {components.engineSource === "installed" ? <Button title={T.resetEngine} systemImage="arrow.uturn.backward.circle" action={restoreBundledEngine} /> : null}
              <RoundedRectangle
                fill="secondarySystemBackground"
                cornerRadius={20}
                frame={{ maxWidth: "infinity", height: 128 }}
                overlay={
                  <HStack spacing={14} padding={16}>
                    <RoundedRectangle fill="#3C2D16" cornerRadius={14} frame={{ width: 52, height: 52 }} overlay={<Image systemName="square.3.layers.3d" foregroundStyle="#FFBE55" font={{ name: "system", size: 24 }} />} />
                    <VStack alignment="leading" spacing={4}>
                      <Text font="headline" fontWeight="semibold">{T.executionLayerComponent}</Text>
                      <Text font="caption" foregroundStyle="secondary">v{components.executionLayerVersion} · {components.executionLayerSource === "installed" ? T.installedComponent : components.executionLayerSource === "engine" ? (isGerman ? "Für installierten Core erzeugt" : "Generated for installed core") : T.bundled}</Text>
                      <Text font="caption" foregroundStyle="green">{T.current} · r8</Text>
                    </VStack>
                    <Spacer />
                    <Image systemName="checkmark.shield.fill" foregroundStyle="secondary" />
                  </HStack>
                }
              />
              <Button title={T.importExecutionLayer} systemImage="square.and.arrow.down.on.square" action={importLayer} buttonStyle="bordered" buttonBorderShape="capsule" />
              {components.executionLayerSource === "installed" ? <Button title={T.resetExecutionLayer} systemImage="arrow.uturn.backward.circle" action={restoreGeneratedLayer} /> : null}
              <RoundedRectangle
                fill="secondarySystemBackground"
                cornerRadius={20}
                frame={{ maxWidth: "infinity", height: 148 }}
                overlay={
                  <HStack spacing={14} padding={16}>
                    <RoundedRectangle fill="#251E4A" cornerRadius={14} frame={{ width: 52, height: 52 }} overlay={<Image systemName="memorychip.fill" foregroundStyle="#A996FF" font={{ name: "system", size: 24 }} />} />
                    <VStack alignment="leading" spacing={4}>
                      <Text font="headline" fontWeight="semibold">{T.runtimeComponent}</Text>
                      <Text font="caption" foregroundStyle="secondary">LÖVE {components.runtimeVersion} · {components.runtimeSource === "bundled" ? T.bundled : T.installedComponent}</Text>
                      <Text font="caption" foregroundStyle={updates?.runtime?.changed ? "orange" : "green"} lineLimit={2}>{updates?.runtime?.changed ? T.sourceChanged : T.current}</Text>
                    </VStack>
                    <Spacer />
                    <Image systemName="checkmark.shield.fill" foregroundStyle="secondary" />
                  </HStack>
                }
              />
              <Button title={T.importRuntimeBundle} systemImage="square.and.arrow.down" action={importRuntime} buttonStyle="bordered" buttonBorderShape="capsule" />
              {updates?.runtime != null ? <Button title={T.openRuntimeSource} systemImage="safari" action={() => Safari.present(updates.runtime!.pageUrl, false)} /> : null}
              {components.runtimeSource === "installed" ? <Button title={T.resetRuntime} systemImage="arrow.uturn.backward.circle" action={restoreBundledRuntime} /> : null}
              <Toggle
                title={T.automaticChecks}
                value={settings.automaticUpdateChecks}
                onChanged={(value: boolean) => {
                  persistSettings({ automaticUpdateChecks: value })
                  if (value) void checkEverything(true)
                }}
              />
              <Text font="footnote" foregroundStyle="secondary">{T.automaticChecksBody}</Text>
              <Text font="headline" fontWeight="semibold">{T.updateFrequency}</Text>
              <Picker
                title={T.updateFrequency}
                value={String(settings.updateCheckIntervalHours)}
                onChanged={(value: string) => persistSettings({ updateCheckIntervalHours: Number(value) as 6 | 12 | 24 | 72 })}
                pickerStyle="segmented"
              >
                <Text tag="6">6 h</Text>
                <Text tag="12">12 h</Text>
                <Text tag="24">24 h</Text>
                <Text tag="72">72 h</Text>
              </Picker>
              <Button title={T.checkEverything} systemImage="arrow.triangle.2.circlepath" action={() => checkEverything(false)} buttonStyle="borderedProminent" buttonBorderShape="capsule" />
              {updates != null && updates.modUpdates.length > 0 ? <Button title={`${T.updateAllMods} (${updates.modUpdates.length})`} systemImage="arrow.down.circle.fill" action={updateAllAvailableMods} buttonStyle="bordered" buttonBorderShape="capsule" /> : null}
              {updates != null && updates.errors.length > 0 ? <Text font="footnote" foregroundStyle="orange">{updates.errors.length} {isGerman ? "Prüfung(en) fehlgeschlagen" : "check(s) failed"}</Text> : null}
              <Text font="footnote" foregroundStyle="secondary">{T.runtimeBundleNotice}</Text>
            </VStack>

            <VStack alignment="leading" spacing={12} frame={{ maxWidth: "infinity" }}>
              <Text font="title2" fontWeight="bold">{T.consoleDiagnostics}</Text>
              <VStack
                alignment="leading"
                spacing={10}
                padding={17}
                frame={{ maxWidth: "infinity" }}
                background="secondarySystemBackground"
                cornerRadius={22}
              >
                <HStack spacing={12}>
                  <RoundedRectangle fill="#251E4A" cornerRadius={14} frame={{ width: 52, height: 52 }} overlay={<Image systemName="terminal.fill" foregroundStyle="#A996FF" font={{ name: "system", size: 24 }} />} />
                  <VStack alignment="leading" spacing={4}>
                    <Text font="headline" fontWeight="semibold">{T.consoleDiagnostics}</Text>
                    <Text font="caption" foregroundStyle="secondary" lineLimit={2}>{diagnosticSummaryText}</Text>
                  </VStack>
                  <Spacer />
                </HStack>
                <Text font="footnote" foregroundStyle="secondary">{T.consoleDiagnosticsBody}</Text>
                <Text font="caption" foregroundStyle={diagnostics.errors > 0 ? "orange" : "green"} lineLimit={5}>{diagnosticLastError}</Text>
                <HStack spacing={10}>
                  <Button title={T.exportDiagnostics} systemImage="square.and.arrow.up" action={exportDiagnostics} buttonStyle="borderedProminent" buttonBorderShape="capsule" />
                  <Button title={T.clearDiagnostics} systemImage="trash" action={clearConsoleDiagnostics} buttonStyle="bordered" buttonBorderShape="capsule" />
                </HStack>
              </VStack>
            </VStack>

            <VStack alignment="leading" spacing={12} frame={{ maxWidth: "infinity" }}>
              <Text font="title2" fontWeight="bold">{T.actions}</Text>
              <LazyVGrid
                columns={[{ size: { type: "adaptive", min: 148, max: 240 }, spacing: 12, alignment: "top" }]}
                alignment="leading"
                spacing={12}
              >
                <ToolCard title={T.official} subtitle={releaseSubtitle(release)} icon="arrow.down.app.fill" tint="#7457F5" action={officialRelease} />
                <ToolCard title={T.exportDiagnostics} subtitle={T.diagnosticsBody} icon="doc.text.magnifyingglass" tint="#5AA9FF" action={exportDiagnostics} />
                <ToolCard title={T.about} subtitle={T.aboutBody} icon="checkmark.shield.fill" tint="orange" action={showAbout} />
              </LazyVGrid>
              <Text font="footnote" foregroundStyle="secondary">{T.networkHint}</Text>
            </VStack>
          </VStack>
        </ScrollView>
      </TabView>
    </NavigationStack>
  )
}

async function run() {
  await Navigation.present({ element: <App />, modalPresentationStyle: "fullScreen" })
  await endDiagnosticSession(DASHBOARD_DIAGNOSTIC_SESSION, "dismissed")
  Script.exit()
}

run().catch(async error => {
  recordDiagnosticError(DASHBOARD_DIAGNOSTIC_SESSION, "dashboard", "presentation_failed", error)
  try {
    await Dialog.alert({
      title: T.error,
      message: `${error instanceof Error ? error.message : String(error)}\n\n${T.fatalDiagnosticsHint}`,
      buttonLabel: T.close,
    })
  } finally {
    await endDiagnosticSession(DASHBOARD_DIAGNOSTIC_SESSION, "failed")
    Script.exit()
  }
})
