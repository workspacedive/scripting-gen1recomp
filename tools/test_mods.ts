import {
  compareModVersions,
  forbiddenModPayload,
  parseGitHubReleaseReference,
  parseGitHubRepo,
  parseModManifest,
  safeModRelativePath,
} from "../modules/mod-validation"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const dramatic = parseModManifest({
  id: "DRAMATIC_SHAPE",
  name: "Dramatic Shape Voxel Mod",
  version: "1.8.2",
  api: 2,
  entry: "main.lua",
  game_version: "0.0.0-dev || >=0.1.37 <2.0.0",
  permissions: ["engine_internals"],
  dependencies: [],
  conflicts: ["ds_fp_ceiling"],
  github: "DramaticShape/DramaticShapeVoxelMod",
  options_schema: "options.lua",
})
assert(dramatic.id === "DRAMATIC_SHAPE", "Dramatic Shape manifest id was not preserved")
assert(dramatic.permissions[0] === "engine_internals", "Declared permission was not parsed")
assert(dramatic.github === "DramaticShape/DramaticShapeVoxelMod", "GitHub source was not normalized")
assert(dramatic.optionsSchema === "options.lua", "Declarative options_schema path was not preserved")
assert(parseGitHubRepo("https://github.com/scottcandy34/DramaticShapeVoxelMod-latest") === "scottcandy34/DramaticShapeVoxelMod-latest", "GitHub URL parsing failed")
assert(parseGitHubRepo("../releases") == null, "Relative GitHub repository path was accepted")
assert(parseGitHubReleaseReference("https://github.com/Roxas2712/kanto-ascendant/releases/tag/v6.0.11")?.tag === "v6.0.11", "Exact GitHub release URL parsing failed")
assert(parseGitHubReleaseReference("https://github.com/Roxas2712/kanto-ascendant/releases/latest")?.repo === "Roxas2712/kanto-ascendant", "Latest GitHub release URL parsing failed")
assert(parseGitHubReleaseReference("https://github.com/Roxas2712/kanto-ascendant")?.tag == null, "Repository URL did not resolve to latest")
assert(parseGitHubReleaseReference("https://evil.example/Roxas2712/kanto-ascendant") == null, "Non-GitHub host was accepted")
assert(parseGitHubReleaseReference("https://github.com/Roxas2712/kanto-ascendant/releases/tag/v6.0.11?x=1") == null, "GitHub release URL with a query was accepted")
assert(parseGitHubReleaseReference("https://github.com/Roxas2712/kanto-ascendant/releases/tag/bad%2Ftag") == null, "GitHub release tag containing a slash was accepted")
assert(safeModRelativePath("assets/maps/pallet.png") === "assets/maps/pallet.png", "Safe path was rejected")
assert(safeModRelativePath("../escape.lua") == null, "Parent traversal was accepted")
assert(safeModRelativePath("/absolute.lua") == null, "Absolute path was accepted")
assert(forbiddenModPayload("private/game.gbc"), "Game Boy ROM payload extension was accepted")
assert(forbiddenModPayload("baseroms/stadium.z64"), "Nintendo 64 ROM payload extension was accepted")
assert(!forbiddenModPayload("assets/voxels.bin"), "Ordinary original asset was rejected")
assert(compareModVersions("1.8.1", "1.8.2") < 0, "Patch-version ordering failed")
assert(compareModVersions("1.8.2", "1.8.2") === 0, "Equal versions did not compare equal")
assert(compareModVersions("2.0.0-beta.1", "2.0.0") < 0, "Prerelease ordering failed")

let rejected = false
try {
  parseModManifest({ id: "bad/mod", name: "Bad", version: "1.0.0", entry: "main.lua", api: 2 })
} catch { rejected = true }
assert(rejected, "Unsafe manifest id was accepted")

rejected = false
try {
  parseModManifest({ id: "future", name: "Future", version: "1.0.0", entry: "main.lua", api: 3 })
} catch { rejected = true }
assert(rejected, "Unsupported future mod API was accepted")

rejected = false
try {
  parseModManifest({ id: "bad_options", name: "Bad", version: "1.0.0", entry: "main.lua", api: 2, options_schema: "../options.lua" })
} catch { rejected = true }
assert(rejected, "Unsafe options_schema path was accepted")

console.log("Mod validation tests passed")
