export type EditionKey = "red" | "blue" | "yellow" | "gold" | "custom"
export type RecompSupport = "stable" | "early" | "unsupported"

export type GameRecord = {
  id: string
  title: string
  edition: EditionKey
  recompSupport: RecompSupport
  sha1: string
  headerTitle: string
  colorMode: "GB" | "GBC"
  originalFileName: string
  romFileName: string
  byteLength: number
  importedAt: string
  lastPlayedAt?: string
  playCount: number
  customCoverFileName?: string
}

export type LibrarySettings = {
  showRuntimeNotice: boolean
}

export type LibraryDocument = {
  schemaVersion: 2
  games: GameRecord[]
  settings: LibrarySettings
}

export type ImportResult = {
  imported: GameRecord[]
  duplicateNames: string[]
  rejected: Array<{ name: string; reason: string }>
}

export type ReleaseAsset = {
  name: string
  downloadUrl: string
  size: number
  digest?: string
}

export type OfficialRelease = {
  version: string
  tag: string
  pageUrl: string
  publishedAt?: string
  checkedAt: string
  ipa?: ReleaseAsset
}

export type ModOptionPrimitive = string | number | boolean

export type ModOptionChoice = {
  label: string
  value: ModOptionPrimitive
}

export type ModOptionToggleRow = {
  key: string
  type: "toggle"
  label: string
  default: boolean
  description?: string
}

export type ModOptionChoiceRow = {
  key: string
  type: "choice"
  label: string
  default: ModOptionPrimitive
  choices: ModOptionChoice[]
  description?: string
}

export type ModOptionNumberRow = {
  key: string
  type: "number"
  label: string
  default: number
  min?: number
  max?: number
  step?: number
  description?: string
}

export type ModOptionTextRow = {
  key: string
  type: "text"
  label: string
  default: string
  maxLen: number
  description?: string
}

export type ModOptionSchemaRow = ModOptionToggleRow | ModOptionChoiceRow | ModOptionNumberRow | ModOptionTextRow

export type ModOptionSchema = {
  version: string
  capturedAt: string
  origin: "declarative" | "runtime"
  rows: ModOptionSchemaRow[]
}

export type InstalledMod = {
  id: string
  name: string
  version: string
  description: string
  entry: string
  api: number
  enabled: boolean
  category?: string
  gameVersion?: string
  permissions: string[]
  dependencies: string[]
  conflicts: string[]
  sourceRepo?: string
  optionsSchemaPath?: string
  optionSchema?: ModOptionSchema
  optionsScannedVersion?: string
  archiveSha256: string
  storage?: "directory" | "archive"
  packageSha256?: string
  byteLength: number
  fileCount: number
  installedAt: string
  updatedAt: string
}

export type ModLibraryDocument = {
  schemaVersion: 1
  mods: InstalledMod[]
}

export type ModRelease = {
  repo: string
  version: string
  tag: string
  pageUrl: string
  publishedAt?: string
  asset: ReleaseAsset
}
