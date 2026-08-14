/*
 * Validation-only subset of documented Scripting globals.
 * It is not a replacement for declarations synchronized from the target app.
 */
declare module "scripting" {
  export const Button: any
  export const Device: any
  export const HStack: any
  export const Image: any
  export const LazyVGrid: any
  export const Label: any
  export const Navigation: any
  export const NavigationStack: any
  export const Picker: any
  export const ProgressView: any
  export const RoundedRectangle: any
  export const Script: any
  export const ScrollView: any
  export const Spacer: any
  export const TabView: any
  export const Text: any
  export const Toggle: any
  export const VStack: any
  export const Path: any
  export function useState<T>(value: T): [T, (value: T | ((current: T) => T)) => void]
  export function useEffect(effect: () => void | (() => void), dependencies?: unknown[]): void
  export function fetch(input: string, init?: any): Promise<any>
}

declare namespace JSX {
  interface Element {}
  interface IntrinsicElements { [name: string]: any }
}

type Data = {
  readonly size: number
  toUint8Array(): Uint8Array | null
  slice(start?: number, end?: number): Data
  toHexString(): string
  toBase64String(): string
  toRawString(encoding?: string): string | null
}
declare const Data: {
  fromFile(path: string): Data | null
  fromBase64String(value: string): Data | null
  fromRawString(value: string, encoding?: string): Data | null
  fromUint8Array(value: Uint8Array): Data | null
  combine(values: Data[]): Data
}
declare const FileManager: any
declare const Crypto: any
declare const Thread: {
  readonly isMainThread: boolean
  runInMain(execute: () => void): void
  runInBackground<T>(execute: () => T | Promise<T>): Promise<T>
}
declare const DocumentPicker: any
declare const Dialog: any
declare const DocumentInteraction: any
declare const Safari: any
declare const console: any
declare class AbortController {
  readonly signal: any
  abort(reason?: unknown): void
}
declare function setTimeout(handler: () => void, milliseconds?: number): number
declare function clearTimeout(handle: number): void

type WebRequest = { url: string; method: string; headers: Record<string, string>; body?: Data | null }
declare class WebViewController {
  shouldAllowRequest?: (request: WebRequest) => Promise<boolean>
  addScriptMessageHandler<P = unknown, R = unknown>(name: string, handler: (params?: P) => R | Promise<R>): Promise<void>
  loadURL(url: string): Promise<boolean>
  loadFile(path: string, allowingReadAccessTo?: string): Promise<boolean>
  present(options?: { fullscreen?: boolean; navigationTitle?: string }): Promise<void>
  evaluateJavaScript<T = unknown>(script: string): Promise<T>
  dismiss(): void
  dispose(): void
}

