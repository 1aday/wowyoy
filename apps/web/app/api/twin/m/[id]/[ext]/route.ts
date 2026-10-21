import { metricJson, metricMarkdown, paths } from "@workspace/compiler"
import { publishedSpecs, specById, specYaml } from "@workspace/metrics"
import { notFound, twinResponse } from "@/lib/compiled/twin"

/** /m/<id>.md, .json and .yaml (rewritten here by next.config.ts). Built once per published spec. */

export const dynamic = "force-static"
export const dynamicParams = false
export const revalidate = false

const exts = ["md", "json", "yaml"] as const
type Ext = (typeof exts)[number]

export function generateStaticParams() {
  return publishedSpecs().flatMap((s) => exts.map((ext) => ({ id: s.id, ext })))
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; ext: string }> }) {
  const { id, ext } = await ctx.params
  const spec = specById(id)
  if (!spec || !(exts as readonly string[]).includes(ext)) return notFound(`No metric "${id}" in the Standard.`)
  const page = { kind: "metric" as const, path: paths.metric(spec.id), spec }
  const published = publishedSpecs()
  const file = `${spec.id}.${ext}`
  switch (ext as Ext) {
    case "md":
      return twinResponse(metricMarkdown(spec, { published }), "md", page, file)
    case "json":
      return twinResponse(`${JSON.stringify(metricJson(spec, { published }), null, 2)}\n`, "json", page, file)
    case "yaml": {
      const yaml = specYaml(spec.id)
      return yaml == null ? notFound() : twinResponse(yaml.endsWith("\n") ? yaml : `${yaml}\n`, "yaml", page, file)
    }
  }
}
