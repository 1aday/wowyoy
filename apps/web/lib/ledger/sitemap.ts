import type { MetadataRoute } from "next"
import { absolute, indexState, paths } from "@workspace/compiler"
import { closesAt } from "@workspace/metrics"
import { archiveWeeks } from "./archive"

/** Sitemap entries for indexed Monday Ledger pages: closed weeks the index policy has admitted. */
export async function ledgerSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  return archiveWeeks()
    .filter((w) => indexState({ kind: "week", path: paths.week(w.id), closed: true }) === "indexed")
    .map((w) => ({ url: absolute(paths.week(w.id)), lastModified: closesAt(w), changeFrequency: "never" as const }))
}
