export const MOD_IMPORT_LIMITS = {
  archiveBytes: 64 * 1024 * 1024,
  fileBytes: 32 * 1024 * 1024,
  totalBytes: 128 * 1024 * 1024,
  filesPerArchive: 32_768,
  entriesPerArchive: 40_000,
  installedFiles: 49_152,
  manifestBytes: 256 * 1024,
} as const
