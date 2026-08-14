import { createHash, randomBytes } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"

const files = new Map<string, Uint8Array>()
const encoder = new TextEncoder()
const decoder = new TextDecoder()

class TestData {
  constructor(private readonly bytes: Uint8Array) {}
  get size(): number { return this.bytes.length }
  toRawString(): string { return decoder.decode(this.bytes) }
  toUint8Array(): Uint8Array { return this.bytes.slice() }
  slice(start?: number, end?: number): TestData { return new TestData(this.bytes.slice(start, end)) }
  toArrayBuffer(): ArrayBuffer { return this.bytes.slice().buffer }
  toHexString(): string { return Buffer.from(this.bytes).toString("hex") }
  toBase64String(): string { return Buffer.from(this.bytes).toString("base64") }
  static fromRawString(value: string): TestData { return new TestData(encoder.encode(value)) }
  static fromBase64String(value: string): TestData { return new TestData(new Uint8Array(Buffer.from(value, "base64"))) }
  static fromUint8Array(value: Uint8Array): TestData { return new TestData(value.slice()) }
  static fromArrayBuffer(value: ArrayBuffer): TestData { return new TestData(new Uint8Array(value).slice()) }
  static combine(values: TestData[]): TestData {
    const size = values.reduce((sum, value) => sum + value.size, 0)
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const value of values) {
      bytes.set(value.toUint8Array(), offset)
      offset += value.size
    }
    return new TestData(bytes)
  }
  static fromFile(path: string): TestData | null {
    const memory = files.get(path)
    if (memory != null) return new TestData(memory.slice())
    if (!existsSync(path)) return null
    return new TestData(new Uint8Array(readFileSync(path)))
  }
}

function removePath(path: string): void {
  files.delete(path)
  const prefix = path.endsWith("/") ? path : `${path}/`
  for (const key of [...files.keys()]) if (key.startsWith(prefix)) files.delete(key)
}

Object.assign(globalThis, {
  Data: TestData,
  FileManager: {
    documentsDirectory: "/tmp/gen1recomp-native-suite-tests",
    temporaryDirectory: "/tmp",
    existsSync: (path: string) => files.has(path) || [...files.keys()].some(key => key.startsWith(`${path}/`)) || existsSync(path),
    exists: async (path: string) => files.has(path) || [...files.keys()].some(key => key.startsWith(`${path}/`)) || existsSync(path),
    createDirectorySync: () => undefined,
    createDirectory: async () => undefined,
    readDirectory: async (path: string) => {
      const prefix = path.endsWith("/") ? path : `${path}/`
      return [...new Set([...files.keys()]
        .filter(item => item.startsWith(prefix))
        .map(item => item.slice(prefix.length).split("/")[0])
        .filter(Boolean))]
    },
    isDirectory: async (path: string) => [...files.keys()].some(item => item.startsWith(`${path}/`)),
    writeAsStringSync: (path: string, value: string) => { files.set(path, encoder.encode(value)) },
    writeAsString: async (path: string, value: string) => { files.set(path, encoder.encode(value)) },
    writeAsDataSync: (path: string, value: TestData) => { files.set(path, value.toUint8Array()) },
    writeAsData: async (path: string, value: TestData) => { files.set(path, value.toUint8Array()) },
    readAsData: async (path: string) => TestData.fromFile(path),
    appendTextSync: (path: string, value: string) => {
      const previous = files.get(path) ?? new Uint8Array(0)
      const added = encoder.encode(value)
      const next = new Uint8Array(previous.length + added.length)
      next.set(previous)
      next.set(added, previous.length)
      files.set(path, next)
    },
    appendText: async (path: string, value: string) => {
      const previous = files.get(path) ?? new Uint8Array(0)
      const added = encoder.encode(value)
      const next = new Uint8Array(previous.length + added.length)
      next.set(previous)
      next.set(added, previous.length)
      files.set(path, next)
    },
    appendDataSync: (path: string, value: TestData) => {
      const previous = files.get(path) ?? new Uint8Array(0)
      const next = new Uint8Array(previous.length + value.size)
      next.set(previous)
      next.set(value.toUint8Array(), previous.length)
      files.set(path, next)
    },
    readAsStringSync: (path: string) => {
      const memory = files.get(path)
      return memory == null ? readFileSync(path, "utf8") : decoder.decode(memory)
    },
    readAsString: async (path: string) => {
      const memory = files.get(path)
      return memory == null ? readFileSync(path, "utf8") : decoder.decode(memory)
    },
    statSync: (path: string) => ({ size: files.get(path)?.length ?? readFileSync(path).length, type: "file" }),
    removeSync: removePath,
    remove: async (path: string) => { removePath(path) },
    renameSync: (source: string, destination: string) => {
      const memory = files.get(source)
      if (memory == null) throw new Error(`Missing in-memory source: ${source}`)
      files.set(destination, memory)
      files.delete(source)
    },
    rename: async (source: string, destination: string) => {
      const memory = files.get(source)
      if (memory == null) throw new Error(`Missing in-memory source: ${source}`)
      files.set(destination, memory)
      files.delete(source)
    },
    copyFileSync: (source: string, destination: string) => {
      const memory = files.get(source)
      if (memory == null) throw new Error(`Missing in-memory source: ${source}`)
      files.set(destination, memory.slice())
    },
    copyFile: async (source: string, destination: string) => {
      const memory = files.get(source)
      if (memory == null) throw new Error(`Missing in-memory source: ${source}`)
      files.set(destination, memory.slice())
    },
  },
  Thread: {
    isMainThread: true,
    runInMain: (execute: () => void) => execute(),
    runInBackground: async <T>(execute: () => T | Promise<T>) => execute(),
  },
  Crypto: {
    sha256: (value: TestData) => new TestData(new Uint8Array(createHash("sha256").update(value.toUint8Array()).digest())),
    generateSymmetricKey: (bits: number) => new TestData(new Uint8Array(randomBytes(Math.max(1, Math.ceil(bits / 8))))),
  },
})

export const Path = {
  join: (...parts: string[]) => parts.join("/").replace(/\/{2,}/g, "/"),
}

export const Script = { directory: process.cwd() }

export async function fetch(input: string, init?: unknown): Promise<unknown> {
  const handler = (globalThis as typeof globalThis & {
    __scriptingFetch?: (url: string, options?: unknown) => Promise<unknown>
  }).__scriptingFetch
  if (handler == null) throw new Error(`No test fetch handler was installed for ${input}`)
  return handler(input, init)
}

export const __testFiles = files
export { TestData }
