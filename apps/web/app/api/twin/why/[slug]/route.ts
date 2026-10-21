import { hasWhy, parseWhySlug, paths, whyMarkdown, whyPages } from "@workspace/compiler"
import { publishedSpecs, specById } from "@workspace/metrics"
import { notFound, twinResponse } from "@/lib/compiled/twin"

/** /why/<metric>-<dropped|spiked>.md (rewritten here by next.config.ts). */

export const dynamic = "force-static"
export const dynamicParams = false
export const revalidate = false

export function generateStaticParams() {
  return whyPages(publishedSpecs()).map((w) => ({ slug: w.slug }))
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const parsed = parseWhySlug(slug)
  const spec = parsed ? specById(parsed.id) : null
  if (!parsed || !spec || !hasWhy(spec)) return notFound(`No Why page "${slug}".`)
  const page = { kind: "why" as const, path: paths.why(spec.id, parsed.direction), spec }
  return twinResponse(whyMarkdown(spec, parsed.direction, { published: publishedSpecs() }), "md", page, `${slug}.md`)
}
