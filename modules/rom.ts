import type { EditionKey, RecompSupport } from "./types"

export type ROMHeader = {
  headerTitle: string
  colorMode: "GB" | "GBC"
}

export type RecognizedROM = {
  edition: EditionKey
  title: string
  support: RecompSupport
}

export const MAX_ROM_BYTES = 16 * 1024 * 1024

export const NINTENDO_LOGO = [
  0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b, 0x03, 0x73, 0x00, 0x83,
  0x00, 0x0c, 0x00, 0x0d, 0x00, 0x08, 0x11, 0x1f, 0x88, 0x89, 0x00, 0x0e,
  0xdc, 0xcc, 0x6e, 0xe6, 0xdd, 0xdd, 0xd9, 0x99, 0xbb, 0xbb, 0x67, 0x63,
  0x6e, 0x0e, 0xec, 0xcc, 0xdd, 0xdc, 0x99, 0x9f, 0xbb, 0xb9, 0x33, 0x3e,
] as const

export const RECOGNIZED_ROMS: Record<string, RecognizedROM> = {
  ea9bcae617fdf159b045185467ae58b2e4a48b9a: { edition: "red", title: "Pokémon Red", support: "stable" },
  d7037c83e1ae5b39bde3c30787637ba1d4c48ce2: { edition: "blue", title: "Pokémon Blue", support: "stable" },
  cc7d03262ebfaf2f06772c1a480c7d9d5f4a38e1: { edition: "yellow", title: "Pokémon Yellow", support: "stable" },
  d8b8a3600a465308c9953dfa04f0081c05bdcb94: { edition: "gold", title: "Pokémon Gold", support: "early" },
}

function headerTitle(bytes: Uint8Array): string {
  const cgbFlag = bytes[0x143]
  const end = cgbFlag === 0x80 || cgbFlag === 0xc0 ? 0x143 : 0x144
  const characters: string[] = []
  for (let index = 0x134; index < end; index += 1) {
    const byte = bytes[index]
    if (byte === 0) break
    if (byte >= 32 && byte <= 126) characters.push(String.fromCharCode(byte))
  }
  return characters.join("").trim()
}

export function inspectROM(bytes: Uint8Array): ROMHeader {
  if (bytes.length < 0x150) throw new Error("The file is too small to be a Game Boy ROM.")
  if (bytes.length > MAX_ROM_BYTES) throw new Error("The ROM is larger than the 16 MB safety limit.")
  for (let index = 0; index < NINTENDO_LOGO.length; index += 1) {
    if (bytes[0x104 + index] !== NINTENDO_LOGO[index]) {
      throw new Error("The Game Boy header logo is invalid.")
    }
  }
  let checksum = 0
  for (let index = 0x134; index <= 0x14c; index += 1) {
    checksum = (checksum - bytes[index] - 1) & 0xff
  }
  if (checksum !== bytes[0x14d]) throw new Error("The Game Boy header checksum is invalid.")
  const cgbFlag = bytes[0x143]
  return {
    headerTitle: headerTitle(bytes),
    colorMode: cgbFlag === 0x80 || cgbFlag === 0xc0 ? "GBC" : "GB",
  }
}

export function identifyROM(sha1: string): RecognizedROM | null {
  return RECOGNIZED_ROMS[sha1.toLowerCase()] ?? null
}
