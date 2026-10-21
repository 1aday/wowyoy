import type { MetricSpec } from "@workspace/metrics"
import { ALWAYS_INDEXED, indexState } from "./index-policy"
import { absolute, paths } from "./site"
import { whyPages } from "./why"

/** Sitemaps list indexed pages only: the same rule as robots meta, asked through `indexState`. */

export const SITEMAPS = ["pages", "metrics", "why", "weeks", "repos"] as const
export type SitemapId = (typeof SITEMAPS)[number]

export const sitemapPath = (id: SitemapId) => `/sitemap/${id}.xml`

/** The hand-written pages indexed from day one. */
export function fixedSitemapUrls(): string[] {
  return [...ALWAYS_INDEXED].sort().map(absolute)
}

export function metricSitemapUrls(published: readonly MetricSpec[]): string[] {
  return published
    .filter((spec) => indexState({ kind: "metric", path: paths.metric(spec.id), spec }) === "indexed")
    .map((s) => absolute(paths.metric(s.id)))
    .sort()
}

export function whySitemapUrls(published: readonly MetricSpec[]): string[] {
  return whyPages(published)
    .filter((w) => indexState({ kind: "why", path: w.path, spec: w.spec }) === "indexed")
    .map((w) => absolute(w.path))
    .sort()
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")

export interface SitemapUrl {
  url: string
  lastModified?: string | Date
}

/** One sitemap: a urlset of absolute URLs. */
export function urlsetXml(urls: readonly SitemapUrl[]): string {
  const at = (d: string | Date) => (typeof d === "string" ? d : d.toISOString())
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (u) =>
        `  <url>\n    <loc>${xmlEscape(u.url)}</loc>${u.lastModified ? `\n    <lastmod>${at(u.lastModified)}</lastmod>` : ""}\n  </url>`
    ),
    "</urlset>",
    "",
  ].join("\n")
}

/** A sitemap index pointing at each split sitemap. */
export function sitemapIndexXml(lastmod: Date): string {
  const at = lastmod.toISOString()
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...SITEMAPS.map(
      (id) => `  <sitemap>\n    <loc>${xmlEscape(absolute(sitemapPath(id)))}</loc>\n    <lastmod>${at}</lastmod>\n  </sitemap>`
    ),
    "</sitemapindex>",
    "",
  ].join("\n")
}
