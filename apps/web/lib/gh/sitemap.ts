import type { MetadataRoute } from "next"
import { absolute, indexState } from "@workspace/compiler"
import { closesAt, latestClosedWeek } from "@workspace/metrics"
import { canonicalPath } from "./view"
import { WATCHED, isOptedOut } from "./seed"

/**
 * Sitemap entries for indexed Repo Pulse pages: the watched repos whose page the index policy has
 * admitted (closed weeks, plus an inbound link or outside visitors). Badges are never listed.
 */
export async function repoSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const lastModified = closesAt(latestClosedWeek(new Date()))
  return WATCHED.flatMap((full) => {
    const [owner = "", repo = ""] = full.split("/")
    const path = canonicalPath(full)
    if (isOptedOut(owner, repo) || indexState({ kind: "repo", path, closed: true }) !== "indexed") return []
    return [{ url: absolute(path), lastModified, changeFrequency: "weekly" as const, priority: 0.5 }]
  })
}
