import { identifyROM, inspectROM, NINTENDO_LOGO } from "../modules/rom"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function fixture(): Uint8Array {
  const bytes = new Uint8Array(32 * 1024)
  bytes.set(NINTENDO_LOGO, 0x104)
  bytes.set(Array.from("TEST GAME").map(character => character.charCodeAt(0)), 0x134)
  bytes[0x143] = 0x80
  let checksum = 0
  for (let index = 0x134; index <= 0x14c; index += 1) checksum = (checksum - bytes[index] - 1) & 0xff
  bytes[0x14d] = checksum
  return bytes
}

const valid = fixture()
const header = inspectROM(valid)
assert(header.headerTitle === "TEST GAME", "Header title was not decoded correctly")
assert(header.colorMode === "GBC", "CGB flag was not recognized")
assert(identifyROM("EA9BCAE617FDF159B045185467AE58B2E4A48B9A")?.edition === "red", "Canonical SHA-1 lookup failed")
assert(identifyROM("0000000000000000000000000000000000000000") == null, "Unknown SHA-1 must not be recognized")

const badLogo = fixture()
badLogo[0x104] ^= 0xff
let logoRejected = false
try { inspectROM(badLogo) } catch { logoRejected = true }
assert(logoRejected, "Invalid Nintendo header logo was accepted")

const badChecksum = fixture()
badChecksum[0x134] ^= 1
let checksumRejected = false
try { inspectROM(badChecksum) } catch { checksumRejected = true }
assert(checksumRejected, "Invalid header checksum was accepted")

console.log("ROM validation tests passed")
