import { Path, fetch } from "scripting"
import type { OfficialRelease, ReleaseAsset } from "./types"
import { discardDownload, downloadVerifiedData } from "./downloads"
import { DOWNLOADS_ROOT, RELEASE_CACHE_FILE, ensureStorage } from "./paths"

const LATEST_RELEASE_API = "https://api.github.com/repos/bryanthaboi/gen1recomp/releases/latest"

type GitHubAsset = {
  name?: unknown
  browser_download_url?: unknown
  size?: unknown
  digest?: unknown
}

type GitHubRelease = {
  tag_name?: unknown
  html_url?: unknown
  published_at?: unknown
  assets?: unknown
}

function trustedGitHubURL(value: string, pathPrefix: string): boolean {
  return value.startsWith(`https://github.com${pathPrefix}`)
}

function assetFrom(value: GitHubAsset): ReleaseAsset | null {
  if (typeof value.name !== "string" || typeof value.browser_download_url !== "string" || typeof value.size !== "number") return null
  if (!trustedGitHubURL(value.browser_download_url, "/bryanthaboi/gen1recomp/releases/download/")) return null
  if (!Number.isFinite(value.size) || value.size <= 0 || value.size > 512 * 1024 * 1024) return null
  return {
    name: value.name,
    downloadUrl: value.browser_download_url,
    size: value.size,
    digest: typeof value.digest === "string" ? value.digest : undefined,
  }
}

function parseRelease(value: GitHubRelease, checkedAt = new Date().toISOString()): OfficialRelease {
  if (typeof value.tag_name !== "string" || typeof value.html_url !== "string"
      || !trustedGitHubURL(value.html_url, "/bryanthaboi/gen1recomp/releases/tag/")) {
    throw new Error("GitHub returned incomplete or untrusted release metadata.")
  }
  const assets = Array.isArray(value.assets) ? value.assets.map(assetFrom).filter((asset): asset is ReleaseAsset => asset != null) : []
  return {
    version: value.tag_name.replace(/^v/i, ""),
    tag: value.tag_name,
    pageUrl: value.html_url,
    publishedAt: typeof value.published_at === "string" ? value.published_at : undefined,
    checkedAt,
    ipa: assets.find(asset => asset.name.toLowerCase().endsWith(".ipa")),
  }
}

export function loadCachedRelease(): OfficialRelease | null {
  ensureStorage()
  if (!FileManager.existsSync(RELEASE_CACHE_FILE)) return null
  try {
    const parsed = JSON.parse(FileManager.readAsStringSync(RELEASE_CACHE_FILE)) as OfficialRelease
    if (typeof parsed.version !== "string" || typeof parsed.pageUrl !== "string") return null
    return parsed
  } catch {
    return null
  }
}

export async function checkOfficialRelease(): Promise<OfficialRelease> {
  const response = await fetch(LATEST_RELEASE_API, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    timeout: 30,
    debugLabel: "Gen1Recomp release check",
  })
  if (!response.ok) throw new Error(`GitHub release check failed with HTTP ${response.status}.`)
  const release = parseRelease(await response.json() as GitHubRelease)
  ensureStorage()
  FileManager.writeAsStringSync(RELEASE_CACHE_FILE, JSON.stringify(release, null, 2))
  return release
}

function safeAssetName(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9._-]/g, "_")
  return clean.toLowerCase().endsWith(".ipa") ? clean : `${clean}.ipa`
}

function expectedSha256(digest?: string): string | null {
  if (digest == null) return null
  const normalized = digest.toLowerCase().replace(/^sha256:/, "")
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null
}

export async function downloadVerifiedIPA(release: OfficialRelease): Promise<string> {
  const asset = release.ipa
  if (asset == null) throw new Error("This release does not publish an iOS IPA asset.")
  const expected = expectedSha256(asset.digest)
  if (expected == null) throw new Error("GitHub did not publish a usable SHA-256 digest for this IPA, so the download was not saved.")

  const downloadId = `ipa:${expected}`
  const data = await downloadVerifiedData({
    id: downloadId,
    kind: "ipa",
    title: `${asset.name} · v${release.version}`,
    url: asset.downloadUrl,
    expectedSize: asset.size,
    expectedSha256: expected,
    debugLabel: `Gen1Recomp ${release.version} IPA`,
  })
  if (asset.size > 0 && data.size !== asset.size) {
    throw new Error(`The downloaded IPA size (${data.size}) does not match GitHub metadata (${asset.size}).`)
  }
  const actual = Crypto.sha256(data).toHexString().toLowerCase()
  if (actual !== expected) throw new Error("The IPA SHA-256 digest does not match GitHub metadata. The file was discarded.")

  ensureStorage()
  const destination = Path.join(DOWNLOADS_ROOT, safeAssetName(asset.name))
  FileManager.writeAsDataSync(destination, data)
  try { discardDownload(downloadId) } catch {
    // The verified IPA is already committed; stale manager cleanup is harmless.
  }
  return destination
}
