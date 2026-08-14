import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import { constants, deflateRawSync } from "node:zlib"
import {
  forbiddenModPayload,
  parseModManifest,
  safeModRelativePath,
} from "../modules/mod-validation.ts"
import {
  createRepackedZip,
  createStoredZip,
  extractLocalZipEntry,
  readLocalZip,
  zipCrc32,
} from "../modules/zip.ts"

function bytes(value) { return new TextEncoder().encode(value) }
function equal(left, right) { assert.deepEqual(Array.from(left), Array.from(right)) }
function put16(view, offset, value) { view.setUint16(offset, value, true) }
function put32(view, offset, value) { view.setUint32(offset, value >>> 0, true) }

function singleZip(pathBytes, data, compressed, method, options = {}) {
  const flags = options.flags ?? 0x0800
  const crc = zipCrc32(data)
  const localSize = 30 + pathBytes.length + compressed.length
  const centralSize = 46 + pathBytes.length
  const output = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(output.buffer)
  put32(view, 0, 0x04034b50)
  put16(view, 4, 20)
  put16(view, 6, flags)
  put16(view, 8, method)
  put16(view, 10, 0)
  put16(view, 12, 0x21)
  put32(view, 14, crc)
  put32(view, 18, compressed.length)
  put32(view, 22, data.length)
  put16(view, 26, pathBytes.length)
  put16(view, 28, 0)
  output.set(pathBytes, 30)
  output.set(compressed, 30 + pathBytes.length)
  const central = localSize
  put32(view, central, 0x02014b50)
  put16(view, central + 4, options.madeBy ?? 0x0314)
  put16(view, central + 6, 20)
  put16(view, central + 8, flags)
  put16(view, central + 10, method)
  put16(view, central + 12, 0)
  put16(view, central + 14, 0x21)
  put32(view, central + 16, crc)
  put32(view, central + 20, compressed.length)
  put32(view, central + 24, data.length)
  put16(view, central + 28, pathBytes.length)
  put16(view, central + 30, 0)
  put16(view, central + 32, 0)
  put16(view, central + 34, 0)
  put16(view, central + 36, 0)
  put32(view, central + 38, options.external ?? ((0o100644 << 16) >>> 0))
  put32(view, central + 42, 0)
  output.set(pathBytes, central + 46)
  const end = central + centralSize
  put32(view, end, 0x06054b50)
  put16(view, end + 4, 0)
  put16(view, end + 6, 0)
  put16(view, end + 8, 1)
  put16(view, end + 10, 1)
  put32(view, end + 12, centralSize)
  put32(view, end + 16, central)
  put16(view, end + 20, 0)
  return { output, central }
}

const stored = createStoredZip([
  { path: "options.lua", bytes: bytes("sound = true\n") },
  { path: "saves/yellow/slot.lua", bytes: Uint8Array.from([0, 1, 2, 254, 255]) },
  { path: "Notizen/über.txt", bytes: bytes("lokal") },
])
const storedEntries = readLocalZip(stored)
assert.equal(storedEntries.length, 3)
assert.deepEqual(storedEntries.map(entry => entry.path), ["options.lua", "saves/yellow/slot.lua", "Notizen/über.txt"])
equal(extractLocalZipEntry(stored, storedEntries[1]), Uint8Array.from([0, 1, 2, 254, 255]))
if (process.env.LOCAL_ZIP_TEST_OUTPUT != null) writeFileSync(process.env.LOCAL_ZIP_TEST_OUTPUT, stored)

const repetitive = bytes("Dramatic Shape voxel data — ".repeat(20_000))
for (const options of [
  { level: 6 },
  { level: 6, strategy: constants.Z_FIXED },
  { level: 0 },
]) {
  const compressed = new Uint8Array(deflateRawSync(repetitive, options))
  const fixture = singleZip(bytes("assets/voxel.bin"), repetitive, compressed, 8).output
  const [entry] = readLocalZip(fixture)
  equal(extractLocalZipEntry(fixture, entry), repetitive)
}

const repackData = bytes("preserve this compressed payload ".repeat(500))
const repackCompressed = new Uint8Array(deflateRawSync(repackData, { level: 9 }))
const repackSource = singleZip(bytes("preserved.txt"), repackData, repackCompressed, 8).output
const [repackSourceEntry] = readLocalZip(repackSource)
const repacked = createRepackedZip([
  {
    path: repackSourceEntry.path,
    method: repackSourceEntry.method,
    compressedBytes: repackSource.subarray(repackSourceEntry.dataOffset, repackSourceEntry.dataOffset + repackSourceEntry.compressedSize),
    uncompressedSize: repackSourceEntry.uncompressedSize,
    crc32: repackSourceEntry.crc32,
  },
  { path: "patched.lua", method: 0, compressedBytes: bytes("return true\n"), uncompressedSize: 12, crc32: zipCrc32(bytes("return true\n")) },
])
const repackedEntries = readLocalZip(repacked)
assert.equal(repackedEntries.length, 2)
assert.equal(repackedEntries[0].method, 8)
assert.equal(repackedEntries[0].compressedSize, repackCompressed.length)
equal(repacked.subarray(repackedEntries[0].dataOffset, repackedEntries[0].dataOffset + repackedEntries[0].compressedSize), repackCompressed)
equal(extractLocalZipEntry(repacked, repackedEntries[0]), repackData)
equal(extractLocalZipEntry(repacked, repackedEntries[1]), bytes("return true\n"))
assert.throws(() => createRepackedZip([
  { path: "same", method: 0, compressedBytes: new Uint8Array(0), uncompressedSize: 0, crc32: 0 },
  { path: "SAME", method: 0, compressedBytes: new Uint8Array(0), uncompressedSize: 0, crc32: 0 },
]), /Duplicate ZIP output path/)

const emptyCompressed = new Uint8Array(deflateRawSync(new Uint8Array(0)))
const emptyFixture = singleZip(bytes("empty.dat"), new Uint8Array(0), emptyCompressed, 8).output
const [emptyEntry] = readLocalZip(emptyFixture)
equal(extractLocalZipEntry(emptyFixture, emptyEntry), new Uint8Array(0))

const legacyFixture = singleZip(Uint8Array.from([0x82, 0x2e, 0x74, 0x78, 0x74]), bytes("cp437"), bytes("cp437"), 0, { flags: 0 }).output
assert.equal(readLocalZip(legacyFixture)[0].path, "é.txt")

const symlinkFixture = singleZip(bytes("link"), bytes("target"), bytes("target"), 0, {
  external: ((0o120777 << 16) >>> 0),
}).output
assert.equal(readLocalZip(symlinkFixture)[0].type, "symlink")

const encrypted = singleZip(bytes("secret"), bytes("x"), bytes("x"), 0, { flags: 0x0801 }).output
assert.throws(() => readLocalZip(encrypted), /Encrypted or masked/)

const corruptFixture = singleZip(bytes("crc.bin"), bytes("correct"), bytes("correct"), 0)
const corrupt = corruptFixture.output.slice()
corrupt[corruptFixture.central + 16] ^= 0x01
new DataView(corrupt.buffer).setUint32(14, new DataView(corrupt.buffer).getUint32(corruptFixture.central + 16, true), true)
const [corruptEntry] = readLocalZip(corrupt)
assert.throws(() => extractLocalZipEntry(corrupt, corruptEntry), /CRC-32 mismatch/)

assert.throws(() => readLocalZip(stored.slice(0, stored.length - 1)), /end record/)
assert.throws(() => createStoredZip([{ path: "../escape", bytes: new Uint8Array(0) }]), /Unsafe ZIP output path/)

if (process.argv[2] != null) {
  const fixture = new Uint8Array(readFileSync(process.argv[2]))
  const entries = readLocalZip(fixture)
  const files = entries.filter(entry => entry.type === "file")
  const paths = new Set()
  let extracted = 0
  let manifest = null
  for (const entry of entries) {
    assert.notEqual(entry.type, "symlink")
    const normalized = safeModRelativePath(entry.path)
    assert.notEqual(normalized, null)
    const key = normalized.toLowerCase()
    assert.equal(paths.has(key), false)
    paths.add(key)
    if (entry.type !== "file") continue
    assert.equal(forbiddenModPayload(normalized), false)
    const output = extractLocalZipEntry(fixture, entry)
    extracted += output.length
    if (normalized === "manifest.json") manifest = parseModManifest(JSON.parse(new TextDecoder().decode(output)))
  }
  assert.equal(entries.length, 310)
  assert.equal(files.length, 257)
  assert.equal(extracted, 19_698_060)
  assert.equal(manifest?.id, "DRAMATIC_SHAPE")
  assert.equal(manifest?.version, "1.8.2")
  console.log("Public Dramatic Shape ZIP passed:", files.length, "files,", extracted, "bytes")
}

console.log("Local ZIP/DEFLATE tests passed")
