import type { MetadataRoute } from "next"
import { SITEMAPS, fixedSitemapUrls, metricSitemapUrls, urlsetXml, whySitemapUrls, type SitemapId } from "@workspace/compiler"
import { publishedSpecs } from "@workspace/metrics"
import { repoSitemapEntries } from "@/lib/gh/sitemap"
import { ledgerSitemapEntries } from "@/lib/ledger/sitemap"

/**
 * The split sitemaps, /sitemap/<id>.xml, listed by the /sitemap.xml index. Only indexed pages
 * appear; `indexState` decides. lastmod is the build, when every compiled page was last written.
 */

export const dynamic = "force-static"
export const dynamicParams = false
export const revalidate = false

const compiledAt = new Date()

export function generateStaticParams() {
  return SITEMAPS.map((id) => ({ file: `${id}.xml` }))
}

/** Pages built elsewhere never take the sitemap down with them. */
async function safely(load: () => Promise<MetadataRoute.Sitemap>): Promise<MetadataRoute.Sitemap> {
  try {
    return await load()
  } catch {
    return []
  }
}

async function entries(id: SitemapId): Promise<MetadataRoute.Sitemap> {
  const at = (url: string) => ({ url, lastModified: compiledAt })
  switch (id) {
    case "pages":
      return fixedSitemapUrls().map(at)
    case "metrics":
      return metricSitemapUrls(publishedSpecs()).map(at)
    case "why":
      return whySitemapUrls(publishedSpecs()).map(at)
    case "weeks":
      return safely(ledgerSitemapEntries)
    case "repos":
      return safely(repoSitemapEntries)
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params
  const id = file.replace(/\.xml$/, "") as SitemapId
  if (!file.endsWith(".xml") || !SITEMAPS.includes(id)) return new Response("Not found.\n", { status: 404 })
  return new Response(urlsetXml(await entries(id)), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  })
}
