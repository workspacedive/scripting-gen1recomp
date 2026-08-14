import {
  RUNTIME_RECOVERY_FILE,
  RUNTIME_RECOVERY_TEMP_FILE,
} from "./paths"

type RuntimeRecoveryJournal = {
  schema: 1
  sessionId: string
  state: "preparing"
  createdAt: string
}

export type RuntimeRecoveryResult = {
  journalFound: boolean
  temporaryDirectoryFound: boolean
}

export async function recoverInterruptedRuntime(directory: string): Promise<RuntimeRecoveryResult> {
  const journalFound = await FileManager.exists(RUNTIME_RECOVERY_FILE)
  const temporaryDirectoryFound = await FileManager.exists(directory)
  if (temporaryDirectoryFound) await FileManager.remove(directory)
  if (journalFound) await FileManager.remove(RUNTIME_RECOVERY_FILE)
  if (await FileManager.exists(RUNTIME_RECOVERY_TEMP_FILE)) await FileManager.remove(RUNTIME_RECOVERY_TEMP_FILE)
  return { journalFound, temporaryDirectoryFound }
}

export async function beginRuntimeRecovery(sessionId: string): Promise<void> {
  const journal: RuntimeRecoveryJournal = {
    schema: 1,
    sessionId,
    state: "preparing",
    createdAt: new Date().toISOString(),
  }
  if (await FileManager.exists(RUNTIME_RECOVERY_TEMP_FILE)) await FileManager.remove(RUNTIME_RECOVERY_TEMP_FILE)
  await FileManager.writeAsString(RUNTIME_RECOVERY_TEMP_FILE, JSON.stringify(journal))
  if (await FileManager.exists(RUNTIME_RECOVERY_FILE)) await FileManager.remove(RUNTIME_RECOVERY_FILE)
  await FileManager.rename(RUNTIME_RECOVERY_TEMP_FILE, RUNTIME_RECOVERY_FILE)
}

export async function clearRuntimeRecovery(sessionId: string): Promise<boolean> {
  if (await FileManager.exists(RUNTIME_RECOVERY_TEMP_FILE)) await FileManager.remove(RUNTIME_RECOVERY_TEMP_FILE)
  if (!await FileManager.exists(RUNTIME_RECOVERY_FILE)) return false
  try {
    const value = JSON.parse(await FileManager.readAsString(RUNTIME_RECOVERY_FILE)) as Partial<RuntimeRecoveryJournal>
    if (value.sessionId !== sessionId) return false
  } catch {
    // A malformed private recovery marker cannot safely outlive cleanup.
  }
  await FileManager.remove(RUNTIME_RECOVERY_FILE)
  return true
}
