export type LocalZipEntry = {
  path: string
  type: "file" | "directory" | "symlink"
  compressedSize: number
  uncompressedSize: number
  method: 0 | 8
  flags: number
  crc32: number
  localHeaderOffset: number
  dataOffset: number
  rawName: Uint8Array
}

export type StoredZipFile = {
  path: string
  bytes: Uint8Array
}

export type RepackedZipFile = {
  path: string
  method: 0 | 8
  compressedBytes: Uint8Array
  uncompressedSize: number
  crc32: number
}

export type ArchiveRepackedZipFile = {
  path: string
  method: 0 | 8
  dataOffset: number
  compressedSize: number
  uncompressedSize: number
  crc32: number
}

const LOCAL_SIGNATURE = 0x04034b50
const CENTRAL_SIGNATURE = 0x02014b50
const END_SIGNATURE = 0x06054b50
const UTF8_FLAG = 0x0800
const DATA_DESCRIPTOR_FLAG = 0x0008
const FORBIDDEN_FLAGS = 0x2061 // encryption, patched data, strong encryption, masked headers

function requireRange(bytes: Uint8Array, offset: number, length: number, label: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length)
      || offset < 0 || length < 0 || offset + length > bytes.length) {
    throw new Error(`Malformed ZIP ${label}.`)
  }
}

function uint16(bytes: Uint8Array, offset: number): number {
  requireRange(bytes, offset, 2, "16-bit field")
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function uint32(bytes: Uint8Array, offset: number): number {
  requireRange(bytes, offset, 4, "32-bit field")
  return (bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)) >>> 0
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let value = 0; value < 256; value += 1) {
    let crc = value
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    table[value] = crc >>> 0
  }
  return table
})()

export function zipCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function decodeUtf8(bytes: Uint8Array): string {
  let result = ""
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index]
    let code = 0
    let count = 0
    if (first < 0x80) {
      code = first
      count = 1
    } else if ((first & 0xe0) === 0xc0) {
      code = first & 0x1f
      count = 2
      if (code < 2) throw new Error("Malformed UTF-8 ZIP path.")
    } else if ((first & 0xf0) === 0xe0) {
      code = first & 0x0f
      count = 3
    } else if ((first & 0xf8) === 0xf0) {
      code = first & 0x07
      count = 4
    } else {
      throw new Error("Malformed UTF-8 ZIP path.")
    }
    if (index + count > bytes.length) throw new Error("Truncated UTF-8 ZIP path.")
    for (let continuation = 1; continuation < count; continuation += 1) {
      const byte = bytes[index + continuation]
      if ((byte & 0xc0) !== 0x80) throw new Error("Malformed UTF-8 ZIP path.")
      code = (code << 6) | (byte & 0x3f)
    }
    if ((count === 3 && code < 0x800) || (count === 4 && code < 0x10000)
        || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      throw new Error("Non-canonical UTF-8 ZIP path.")
    }
    result += code <= 0xffff
      ? String.fromCharCode(code)
      : String.fromCharCode(0xd800 + ((code - 0x10000) >>> 10), 0xdc00 + ((code - 0x10000) & 0x3ff))
    index += count
  }
  return result
}

export function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = []
  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) throw new Error("ZIP path contains an unpaired surrogate.")
      const low = value.charCodeAt(index + 1)
      if (low < 0xdc00 || low > 0xdfff) throw new Error("ZIP path contains an unpaired surrogate.")
      code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00)
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error("ZIP path contains an unpaired surrogate.")
    }
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) bytes.push(0xc0 | (code >>> 6), 0x80 | (code & 0x3f))
    else if (code < 0x10000) bytes.push(0xe0 | (code >>> 12), 0x80 | ((code >>> 6) & 0x3f), 0x80 | (code & 0x3f))
    else bytes.push(0xf0 | (code >>> 18), 0x80 | ((code >>> 12) & 0x3f), 0x80 | ((code >>> 6) & 0x3f), 0x80 | (code & 0x3f))
  }
  return Uint8Array.from(bytes)
}

const CP437 = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´≡±‗¾¶§÷¸°¨·¹³²■ "

function decodeLegacyPath(bytes: Uint8Array): string {
  let result = ""
  for (const byte of bytes) result += byte < 0x80 ? String.fromCharCode(byte) : CP437[byte - 0x80]
  return result
}

function unicodePathFromExtra(extra: Uint8Array, rawName: Uint8Array): string | null {
  let cursor = 0
  while (cursor < extra.length) {
    if (cursor + 4 > extra.length) throw new Error("Malformed ZIP extra field.")
    const id = uint16(extra, cursor)
    const length = uint16(extra, cursor + 2)
    cursor += 4
    if (cursor + length > extra.length) throw new Error("Truncated ZIP extra field.")
    if (id === 0x7075 && length >= 5 && extra[cursor] === 1
        && uint32(extra, cursor + 1) === zipCrc32(rawName)) {
      return decodeUtf8(extra.slice(cursor + 5, cursor + length))
    }
    cursor += length
  }
  return null
}

function findEndRecord(bytes: Uint8Array): number {
  if (bytes.length < 22) throw new Error("The ZIP is too short.")
  const minimum = Math.max(0, bytes.length - 22 - 0xffff)
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (uint32(bytes, offset) !== END_SIGNATURE) continue
    const commentLength = uint16(bytes, offset + 20)
    if (offset + 22 + commentLength === bytes.length) return offset
  }
  throw new Error("The ZIP end record is missing or malformed.")
}

function classifyEntry(path: string, madeBy: number, externalAttributes: number): LocalZipEntry["type"] {
  const platform = madeBy >>> 8
  if (platform === 3) {
    const kind = (externalAttributes >>> 16) & 0xf000
    if (kind === 0xa000) return "symlink"
    if (kind === 0x4000) return "directory"
  }
  if (path.endsWith("/") || (externalAttributes & 0x10) !== 0) return "directory"
  return "file"
}

export function readLocalZip(bytes: Uint8Array): LocalZipEntry[] {
  const end = findEndRecord(bytes)
  const disk = uint16(bytes, end + 4)
  const centralDisk = uint16(bytes, end + 6)
  const diskEntries = uint16(bytes, end + 8)
  const entryCount = uint16(bytes, end + 10)
  const centralSize = uint32(bytes, end + 12)
  const centralOffset = uint32(bytes, end + 16)
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount) throw new Error("Multi-disk ZIPs are not supported.")
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 archives are not supported by the local importer.")
  }
  if (centralOffset + centralSize !== end) throw new Error("The ZIP central directory has inconsistent bounds.")

  const entries: LocalZipEntry[] = []
  const occupied: Array<{ start: number; end: number }> = []
  let cursor = centralOffset
  for (let index = 0; index < entryCount; index += 1) {
    requireRange(bytes, cursor, 46, "central header")
    if (uint32(bytes, cursor) !== CENTRAL_SIGNATURE) throw new Error("A ZIP central header is missing.")
    const madeBy = uint16(bytes, cursor + 4)
    const flags = uint16(bytes, cursor + 8)
    const method = uint16(bytes, cursor + 10)
    const crc32 = uint32(bytes, cursor + 16)
    const compressedSize = uint32(bytes, cursor + 20)
    const uncompressedSize = uint32(bytes, cursor + 24)
    const nameLength = uint16(bytes, cursor + 28)
    const extraLength = uint16(bytes, cursor + 30)
    const commentLength = uint16(bytes, cursor + 32)
    const startDisk = uint16(bytes, cursor + 34)
    const externalAttributes = uint32(bytes, cursor + 38)
    const localHeaderOffset = uint32(bytes, cursor + 42)
    const recordLength = 46 + nameLength + extraLength + commentLength
    requireRange(bytes, cursor, recordLength, "central entry")
    if (startDisk !== 0) throw new Error("Multi-disk ZIP entries are not supported.")
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw new Error("ZIP64 entries are not supported by the local importer.")
    }
    if ((flags & FORBIDDEN_FLAGS) !== 0) throw new Error("Encrypted or masked ZIP entries are not supported.")
    if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP compression method ${method}.`)

    const rawName = bytes.slice(cursor + 46, cursor + 46 + nameLength)
    if (rawName.length === 0) throw new Error("A ZIP entry has an empty path.")
    const extra = bytes.slice(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength)
    const path = (unicodePathFromExtra(extra, rawName)
      ?? ((flags & UTF8_FLAG) !== 0 ? decodeUtf8(rawName) : decodeLegacyPath(rawName))).normalize("NFC")
    if (path.includes("\0")) throw new Error("A ZIP entry path contains a null byte.")

    requireRange(bytes, localHeaderOffset, 30, "local header")
    if (uint32(bytes, localHeaderOffset) !== LOCAL_SIGNATURE) throw new Error("A ZIP local header is missing.")
    const localFlags = uint16(bytes, localHeaderOffset + 6)
    const localMethod = uint16(bytes, localHeaderOffset + 8)
    const localNameLength = uint16(bytes, localHeaderOffset + 26)
    const localExtraLength = uint16(bytes, localHeaderOffset + 28)
    requireRange(bytes, localHeaderOffset, 30 + localNameLength + localExtraLength, "local entry")
    const localName = bytes.slice(localHeaderOffset + 30, localHeaderOffset + 30 + localNameLength)
    if (localFlags !== flags || localMethod !== method || !equalBytes(localName, rawName)) {
      throw new Error("A ZIP local header disagrees with its central entry.")
    }
    if ((flags & DATA_DESCRIPTOR_FLAG) === 0) {
      if (uint32(bytes, localHeaderOffset + 14) !== crc32
          || uint32(bytes, localHeaderOffset + 18) !== compressedSize
          || uint32(bytes, localHeaderOffset + 22) !== uncompressedSize) {
        throw new Error("A ZIP local header has inconsistent sizes or CRC.")
      }
    }
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength
    requireRange(bytes, dataOffset, compressedSize, "compressed payload")
    if (dataOffset + compressedSize > centralOffset) throw new Error("A ZIP payload overlaps its central directory.")
    occupied.push({ start: localHeaderOffset, end: dataOffset + compressedSize })
    entries.push({
      path,
      type: classifyEntry(path, madeBy, externalAttributes),
      compressedSize,
      uncompressedSize,
      method: method as 0 | 8,
      flags,
      crc32,
      localHeaderOffset,
      dataOffset,
      rawName,
    })
    cursor += recordLength
  }
  if (cursor !== centralOffset + centralSize) throw new Error("The ZIP central directory size is inconsistent.")
  occupied.sort((left, right) => left.start - right.start)
  for (let index = 1; index < occupied.length; index += 1) {
    if (occupied[index].start < occupied[index - 1].end) throw new Error("ZIP entries overlap each other.")
  }
  return entries
}

class BitReader {
  private bitOffset = 0

  constructor(private readonly bytes: Uint8Array) {}

  get remainingBits(): number { return this.bytes.length * 8 - this.bitOffset }

  peekBits(count: number): number {
    if (count < 0 || count > 16) throw new Error("Invalid DEFLATE bit count.")
    const byte = this.bitOffset >>> 3
    const shift = this.bitOffset & 7
    const word = (this.bytes[byte] ?? 0)
      | ((this.bytes[byte + 1] ?? 0) << 8)
      | ((this.bytes[byte + 2] ?? 0) << 16)
    return (word >>> shift) & (count === 16 ? 0xffff : (1 << count) - 1)
  }

  readBits(count: number): number {
    if (count > this.remainingBits) throw new Error("Truncated DEFLATE stream.")
    const value = this.peekBits(count)
    this.bitOffset += count
    return value
  }

  skipBits(count: number): void {
    if (count > this.remainingBits) throw new Error("Truncated DEFLATE stream.")
    this.bitOffset += count
  }

  alignToByte(): void {
    this.bitOffset = (this.bitOffset + 7) & ~7
    if (this.bitOffset > this.bytes.length * 8) throw new Error("Truncated DEFLATE padding.")
  }

  readAlignedBytes(length: number): Uint8Array {
    if ((this.bitOffset & 7) !== 0) throw new Error("Internal DEFLATE alignment error.")
    const offset = this.bitOffset >>> 3
    if (length < 0 || offset + length > this.bytes.length) throw new Error("Truncated DEFLATE stored block.")
    this.bitOffset += length * 8
    return this.bytes.subarray(offset, offset + length)
  }
}

type HuffmanTable = { maximumBits: number; values: Int32Array }

function reverseBits(value: number, count: number): number {
  let reversed = 0
  for (let bit = 0; bit < count; bit += 1) {
    reversed = (reversed << 1) | ((value >>> bit) & 1)
  }
  return reversed
}

function huffmanTable(lengths: number[]): HuffmanTable {
  const counts = new Int32Array(16)
  let maximumBits = 0
  for (const length of lengths) {
    if (!Number.isInteger(length) || length < 0 || length > 15) throw new Error("Invalid DEFLATE code length.")
    if (length > 0) {
      counts[length] += 1
      maximumBits = Math.max(maximumBits, length)
    }
  }
  if (maximumBits === 0) throw new Error("DEFLATE Huffman alphabet is empty.")
  let remaining = 1
  for (let length = 1; length <= 15; length += 1) {
    remaining = remaining * 2 - counts[length]
    if (remaining < 0) throw new Error("Oversubscribed DEFLATE Huffman alphabet.")
  }
  const next = new Int32Array(16)
  let code = 0
  for (let length = 1; length <= 15; length += 1) {
    code = (code + counts[length - 1]) << 1
    next[length] = code
  }
  const values = new Int32Array(1 << maximumBits)
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    const length = lengths[symbol]
    if (length === 0) continue
    const reversed = reverseBits(next[length], length)
    next[length] += 1
    const suffixes = 1 << (maximumBits - length)
    const packed = (length << 16) | (symbol + 1)
    for (let suffix = 0; suffix < suffixes; suffix += 1) values[reversed | (suffix << length)] = packed
  }
  return { maximumBits, values }
}

function decodeSymbol(reader: BitReader, table: HuffmanTable): number {
  const packed = table.values[reader.peekBits(table.maximumBits)]
  const length = packed >>> 16
  if (packed === 0 || length > reader.remainingBits) throw new Error("Invalid or truncated DEFLATE Huffman code.")
  reader.skipBits(length)
  return (packed & 0xffff) - 1
}

const FIXED_LITERAL_LENGTHS = Array.from({ length: 288 }, (_, symbol) => (
  symbol <= 143 ? 8 : symbol <= 255 ? 9 : symbol <= 279 ? 7 : 8
))
const FIXED_DISTANCE_LENGTHS = Array.from({ length: 32 }, () => 5)
const FIXED_LITERAL_TABLE = huffmanTable(FIXED_LITERAL_LENGTHS)
const FIXED_DISTANCE_TABLE = huffmanTable(FIXED_DISTANCE_LENGTHS)
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DISTANCE_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DISTANCE_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]

function dynamicTables(reader: BitReader): [HuffmanTable, HuffmanTable] {
  const literalCount = reader.readBits(5) + 257
  const distanceCount = reader.readBits(5) + 1
  const codeLengthCount = reader.readBits(4) + 4
  if (literalCount > 286 || distanceCount > 32) throw new Error("Invalid DEFLATE dynamic alphabet size.")
  const codeLengths = Array.from({ length: 19 }, () => 0)
  for (let index = 0; index < codeLengthCount; index += 1) codeLengths[CODE_LENGTH_ORDER[index]] = reader.readBits(3)
  const codeTable = huffmanTable(codeLengths)
  const lengths: number[] = []
  const total = literalCount + distanceCount
  while (lengths.length < total) {
    const symbol = decodeSymbol(reader, codeTable)
    if (symbol <= 15) {
      lengths.push(symbol)
    } else if (symbol === 16) {
      if (lengths.length === 0) throw new Error("Invalid DEFLATE repeat without a previous length.")
      const count = reader.readBits(2) + 3
      const previous = lengths[lengths.length - 1]
      if (lengths.length + count > total) throw new Error("DEFLATE code-length repeat exceeds its alphabet.")
      for (let index = 0; index < count; index += 1) lengths.push(previous)
    } else if (symbol === 17 || symbol === 18) {
      const count = reader.readBits(symbol === 17 ? 3 : 7) + (symbol === 17 ? 3 : 11)
      if (lengths.length + count > total) throw new Error("DEFLATE zero repeat exceeds its alphabet.")
      for (let index = 0; index < count; index += 1) lengths.push(0)
    } else {
      throw new Error("Invalid DEFLATE code-length symbol.")
    }
  }
  const literalLengths = lengths.slice(0, literalCount)
  if (literalLengths[256] === 0) throw new Error("DEFLATE dynamic alphabet has no end marker.")
  return [huffmanTable(literalLengths), huffmanTable(lengths.slice(literalCount))]
}

export function inflateRaw(compressed: Uint8Array, expectedSize: number): Uint8Array {
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0) throw new Error("Invalid expected DEFLATE size.")
  const output = new Uint8Array(expectedSize)
  const reader = new BitReader(compressed)
  let position = 0
  let final = false
  while (!final) {
    final = reader.readBits(1) === 1
    const type = reader.readBits(2)
    if (type === 0) {
      reader.alignToByte()
      const length = reader.readBits(16)
      const inverse = reader.readBits(16)
      if (((length ^ 0xffff) & 0xffff) !== inverse) throw new Error("Invalid DEFLATE stored-block length.")
      if (position + length > output.length) throw new Error("DEFLATE output exceeds its declared ZIP size.")
      output.set(reader.readAlignedBytes(length), position)
      position += length
      continue
    }
    if (type === 3) throw new Error("Reserved DEFLATE block type.")
    const [literalTable, distanceTable] = type === 1
      ? [FIXED_LITERAL_TABLE, FIXED_DISTANCE_TABLE]
      : dynamicTables(reader)
    while (true) {
      const symbol = decodeSymbol(reader, literalTable)
      if (symbol < 256) {
        if (position >= output.length) throw new Error("DEFLATE output exceeds its declared ZIP size.")
        output[position] = symbol
        position += 1
        continue
      }
      if (symbol === 256) break
      if (symbol < 257 || symbol > 285) throw new Error("Invalid DEFLATE length symbol.")
      const lengthIndex = symbol - 257
      const length = LENGTH_BASE[lengthIndex] + reader.readBits(LENGTH_EXTRA[lengthIndex])
      const distanceSymbol = decodeSymbol(reader, distanceTable)
      if (distanceSymbol < 0 || distanceSymbol >= DISTANCE_BASE.length) throw new Error("Invalid DEFLATE distance symbol.")
      const distance = DISTANCE_BASE[distanceSymbol] + reader.readBits(DISTANCE_EXTRA[distanceSymbol])
      if (distance > position || position + length > output.length) throw new Error("Invalid DEFLATE back-reference.")
      for (let index = 0; index < length; index += 1) {
        output[position] = output[position - distance]
        position += 1
      }
    }
  }
  if (position !== output.length) throw new Error("DEFLATE output does not match its declared ZIP size.")
  return output
}

export function extractLocalZipEntry(archive: Uint8Array, entry: LocalZipEntry): Uint8Array {
  requireRange(archive, entry.dataOffset, entry.compressedSize, "entry payload")
  const compressed = archive.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize)
  let output: Uint8Array
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.uncompressedSize) throw new Error(`Stored ZIP entry has inconsistent sizes: ${entry.path}`)
    output = compressed.slice()
  } else {
    output = inflateRaw(compressed, entry.uncompressedSize)
  }
  if (zipCrc32(output) !== entry.crc32) throw new Error(`ZIP CRC-32 mismatch: ${entry.path}`)
  return output
}

function put16(view: DataView, offset: number, value: number): void { view.setUint16(offset, value, true) }
function put32(view: DataView, offset: number, value: number): void { view.setUint32(offset, value >>> 0, true) }

function safeOutputPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").normalize("NFC")
  const parts = normalized.split("/")
  if (normalized === "" || normalized.startsWith("/") || normalized.includes("\0")
      || parts.some(part => part === "" || part === "." || part === "..")) {
    throw new Error(`Unsafe ZIP output path: ${path}`)
  }
  return normalized
}

type RepackedZipSource = {
  path: string
  method: 0 | 8
  compressedSize: number
  uncompressedSize: number
  crc32: number
  copyCompressed: (output: Uint8Array, offset: number) => void
}

function createRepackedZipFromSources(files: RepackedZipSource[]): Uint8Array {
  if (files.length === 0 || files.length > 0xffff) throw new Error("A local ZIP must contain 1–65535 files.")
  const prepared = files.map(file => {
    const path = safeOutputPath(file.path)
    const name = encodeUtf8(path)
    if (name.length > 0xffff || !Number.isSafeInteger(file.uncompressedSize)
        || file.uncompressedSize < 0 || file.uncompressedSize > 0xffffffff
        || !Number.isSafeInteger(file.compressedSize) || file.compressedSize < 0 || file.compressedSize > 0xffffffff
        || !Number.isSafeInteger(file.crc32) || file.crc32 < 0 || file.crc32 > 0xffffffff
        || (file.method !== 0 && file.method !== 8)
        || (file.method === 0 && file.compressedSize !== file.uncompressedSize)) {
      throw new Error(`ZIP output entry is invalid or too large: ${path}`)
    }
    return { ...file, path, name, offset: 0 }
  })
  const paths = new Set<string>()
  for (const item of prepared) {
    const key = item.path.toLowerCase()
    if (paths.has(key)) throw new Error(`Duplicate ZIP output path: ${item.path}`)
    paths.add(key)
  }
  let localSize = 0
  let centralSize = 0
  for (const item of prepared) {
    item.offset = localSize
    localSize += 30 + item.name.length + item.compressedSize
    centralSize += 46 + item.name.length
  }
  const total = localSize + centralSize + 22
  if (!Number.isSafeInteger(total) || total > 0xffffffff) throw new Error("The local ZIP output exceeds 4 GiB.")
  const output = new Uint8Array(total)
  const view = new DataView(output.buffer)
  let cursor = 0
  for (const item of prepared) {
    put32(view, cursor, LOCAL_SIGNATURE)
    put16(view, cursor + 4, 20)
    put16(view, cursor + 6, UTF8_FLAG)
    put16(view, cursor + 8, item.method)
    put16(view, cursor + 10, 0)
    put16(view, cursor + 12, 0x21)
    put32(view, cursor + 14, item.crc32)
    put32(view, cursor + 18, item.compressedSize)
    put32(view, cursor + 22, item.uncompressedSize)
    put16(view, cursor + 26, item.name.length)
    put16(view, cursor + 28, 0)
    output.set(item.name, cursor + 30)
    item.copyCompressed(output, cursor + 30 + item.name.length)
    cursor += 30 + item.name.length + item.compressedSize
  }
  const centralOffset = cursor
  for (const item of prepared) {
    put32(view, cursor, CENTRAL_SIGNATURE)
    put16(view, cursor + 4, 0x0314)
    put16(view, cursor + 6, 20)
    put16(view, cursor + 8, UTF8_FLAG)
    put16(view, cursor + 10, item.method)
    put16(view, cursor + 12, 0)
    put16(view, cursor + 14, 0x21)
    put32(view, cursor + 16, item.crc32)
    put32(view, cursor + 20, item.compressedSize)
    put32(view, cursor + 24, item.uncompressedSize)
    put16(view, cursor + 28, item.name.length)
    put16(view, cursor + 30, 0)
    put16(view, cursor + 32, 0)
    put16(view, cursor + 34, 0)
    put16(view, cursor + 36, 0)
    put32(view, cursor + 38, (0o100644 << 16) >>> 0)
    put32(view, cursor + 42, item.offset)
    output.set(item.name, cursor + 46)
    cursor += 46 + item.name.length
  }
  put32(view, cursor, END_SIGNATURE)
  put16(view, cursor + 4, 0)
  put16(view, cursor + 6, 0)
  put16(view, cursor + 8, prepared.length)
  put16(view, cursor + 10, prepared.length)
  put32(view, cursor + 12, cursor - centralOffset)
  put32(view, cursor + 16, centralOffset)
  put16(view, cursor + 20, 0)
  return output
}

export function createRepackedZip(files: RepackedZipFile[]): Uint8Array {
  return createRepackedZipFromSources(files.map(file => ({
    path: file.path,
    method: file.method,
    compressedSize: file.compressedBytes.length,
    uncompressedSize: file.uncompressedSize,
    crc32: file.crc32,
    copyCompressed: (output: Uint8Array, offset: number) => output.set(file.compressedBytes, offset),
  })))
}

export function createRepackedZipFromArchive(
  archive: Uint8Array,
  files: ArchiveRepackedZipFile[],
): Uint8Array {
  return createRepackedZipFromSources(files.map(file => {
    requireRange(archive, file.dataOffset, file.compressedSize, "repacked entry payload")
    return {
      path: file.path,
      method: file.method,
      compressedSize: file.compressedSize,
      uncompressedSize: file.uncompressedSize,
      crc32: file.crc32,
      copyCompressed: (output: Uint8Array, offset: number) => {
        output.set(archive.subarray(file.dataOffset, file.dataOffset + file.compressedSize), offset)
      },
    }
  }))
}

export function createStoredZip(files: StoredZipFile[]): Uint8Array {
  return createRepackedZip(files.map(file => ({
    path: file.path,
    method: 0,
    compressedBytes: file.bytes,
    uncompressedSize: file.bytes.length,
    crc32: zipCrc32(file.bytes),
  })))
}
