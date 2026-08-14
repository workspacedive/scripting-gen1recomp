import { __testFiles } from "./scripting-node-stub"
import { RUNTIME_RECOVERY_FILE, RUNTIME_RECOVERY_TEMP_FILE } from "../modules/paths"
import { beginRuntimeRecovery, clearRuntimeRecovery, recoverInterruptedRuntime } from "../modules/runtime-recovery"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const encoder = new TextEncoder()
const runtimeDirectory = "/tmp/private-runtime-recovery-test"

await beginRuntimeRecovery("session-one")
assert(__testFiles.has(RUNTIME_RECOVERY_FILE), "Recovery marker was not atomically committed")
assert(!__testFiles.has(RUNTIME_RECOVERY_TEMP_FILE), "Recovery transaction debris survived commit")
assert(await clearRuntimeRecovery("another-session") === false, "A different session cleared the active recovery marker")
assert(__testFiles.has(RUNTIME_RECOVERY_FILE), "A different session removed the active recovery marker")
assert(await clearRuntimeRecovery("session-one") === true, "The owning session did not clear its recovery marker")

await beginRuntimeRecovery("interrupted")
__testFiles.set(`${runtimeDirectory}/binary-package-0000.js`, encoder.encode("private payload"))
const recovered = await recoverInterruptedRuntime(runtimeDirectory)
assert(recovered.journalFound && recovered.temporaryDirectoryFound, "Interrupted launch inventory was not detected")
assert(!__testFiles.has(RUNTIME_RECOVERY_FILE), "Interrupted recovery marker survived cleanup")
assert(![...__testFiles.keys()].some(path => path.startsWith(`${runtimeDirectory}/`)), "Interrupted private runtime survived cleanup")

__testFiles.set(RUNTIME_RECOVERY_FILE, encoder.encode("malformed"))
assert(await clearRuntimeRecovery("unused") === true, "Malformed recovery marker was not removed fail-closed")

console.log("Persistent runtime recovery tests passed")
