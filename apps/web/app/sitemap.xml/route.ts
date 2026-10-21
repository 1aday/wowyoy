import { sitemapIndexXml } from "@workspace/compiler"

/** The sitemap index robots.txt points at: one child sitemap per kind of page. */

export const dynamic = "force-static"
export const revalidate = false

const compiledAt = new Date()

export function GET() {
  return new Response(sitemapIndexXml(compiledAt), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  })
}
