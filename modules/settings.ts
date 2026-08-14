import type { PerformanceProfile } from "./config"
import { SETTINGS_BACKUP_FILE, SETTINGS_FILE, ensureStorage } from "./paths"

export type SuiteSettings = {
  schema: 1
  performanceProfile: PerformanceProfile
  automaticUpdateChecks: boolean
  updateCheckIntervalHours: 6 | 12 | 24 | 72
  saveSyncSeconds: 10 | 15 | 30 | 60
  lastUpdateCheck?: string
  lastPerformance?: {
    fps: number
    slowFramePercent: number
    worstFrameMs: number
    measuredAt: string
    profile: PerformanceProfile
  }
}

const DEFAULTS: SuiteSettings = {
  schema: 1,
  performanceProfile: "balanced",
  automaticUpdateChecks: false,
  updateCheckIntervalHours: 24,
  saveSyncSeconds: 15,
}

function parse(path: string): SuiteSettings | null {
  if (!FileManager.existsSync(path)) return null
  try {
    const value = JSON.parse(FileManager.readAsStringSync(path)) as Partial<SuiteSettings>
    if (value == null || typeof value !== "object" || value.schema !== 1) return null
    const performanceProfile = ["balanced", "efficient", "quality"].includes(String(value.performanceProfile))
      ? value.performanceProfile as PerformanceProfile : DEFAULTS.performanceProfile
    const interval = [6, 12, 24, 72].includes(Number(value.updateCheckIntervalHours))
      ? Number(value.updateCheckIntervalHours) as SuiteSettings["updateCheckIntervalHours"] : DEFAULTS.updateCheckIntervalHours
    const saveSync = [10, 15, 30, 60].includes(Number(value.saveSyncSeconds))
      ? Number(value.saveSyncSeconds) as SuiteSettings["saveSyncSeconds"] : DEFAULTS.saveSyncSeconds
    let lastUpdateCheck: string | undefined
    if (typeof value.lastUpdateCheck === "string") {
      const date = new Date(value.lastUpdateCheck)
      if (!Number.isNaN(date.getTime())) lastUpdateCheck = date.toISOString()
    }
    let lastPerformance: SuiteSettings["lastPerformance"]
    if (value.lastPerformance != null && typeof value.lastPerformance === "object") {
      const metric = value.lastPerformance as NonNullable<SuiteSettings["lastPerformance"]>
      const measured = new Date(metric.measuredAt)
      if (Number.isFinite(metric.fps) && metric.fps >= 0 && metric.fps <= 240
          && Number.isFinite(metric.slowFramePercent) && metric.slowFramePercent >= 0 && metric.slowFramePercent <= 100
          && Number.isFinite(metric.worstFrameMs) && metric.worstFrameMs >= 0 && metric.worstFrameMs <= 10_000
          && !Number.isNaN(measured.getTime())
          && ["balanced", "efficient", "quality"].includes(metric.profile)) {
        lastPerformance = { ...metric, measuredAt: measured.toISOString() }
      }
    }
    return {
      schema: 1,
      performanceProfile,
      automaticUpdateChecks: value.automaticUpdateChecks === true,
      updateCheckIntervalHours: interval,
      saveSyncSeconds: saveSync,
      ...(lastUpdateCheck == null ? {} : { lastUpdateCheck }),
      ...(lastPerformance == null ? {} : { lastPerformance }),
    }
  } catch {
    return null
  }
}

export function loadSettings(): SuiteSettings {
  ensureStorage()
  const settings = parse(SETTINGS_FILE) ?? parse(SETTINGS_BACKUP_FILE) ?? { ...DEFAULTS }
  if (!FileManager.existsSync(SETTINGS_FILE)) FileManager.writeAsStringSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
  return settings
}

export function saveSettings(settings: SuiteSettings): SuiteSettings {
  ensureStorage()
  const normalized: SuiteSettings = {
    schema: 1,
    performanceProfile: settings.performanceProfile,
    automaticUpdateChecks: settings.automaticUpdateChecks,
    updateCheckIntervalHours: settings.updateCheckIntervalHours,
    saveSyncSeconds: settings.saveSyncSeconds,
    ...(settings.lastUpdateCheck == null ? {} : { lastUpdateCheck: new Date(settings.lastUpdateCheck).toISOString() }),
    ...(settings.lastPerformance == null ? {} : { lastPerformance: settings.lastPerformance }),
  }
  if (FileManager.existsSync(SETTINGS_FILE)) {
    if (FileManager.existsSync(SETTINGS_BACKUP_FILE)) FileManager.removeSync(SETTINGS_BACKUP_FILE)
    FileManager.copyFileSync(SETTINGS_FILE, SETTINGS_BACKUP_FILE)
  }
  FileManager.writeAsStringSync(SETTINGS_FILE, JSON.stringify(normalized, null, 2))
  return normalized
}

export function automaticUpdateCheckDue(settings: SuiteSettings, now = new Date()): boolean {
  if (!settings.automaticUpdateChecks) return false
  if (settings.lastUpdateCheck == null) return true
  const previous = new Date(settings.lastUpdateCheck).getTime()
  return !Number.isFinite(previous)
    || now.getTime() - previous >= settings.updateCheckIntervalHours * 60 * 60 * 1000
}
