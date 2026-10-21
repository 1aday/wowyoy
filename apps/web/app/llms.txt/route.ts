import { llmsTxt } from "@workspace/compiler"
import { publishedSpecs } from "@workspace/metrics"
import { TWIN_CACHE, contentTypes } from "@/lib/compiled/twin"

/** llmstxt.org index of the Standard's Markdown twins and the machine endpoints. */

export const dynamic = "force-static"
export const revalidate = false

export function GET() {
  return new Response(llmsTxt(publishedSpecs()), {
    headers: { "Content-Type": contentTypes.txt, "Cache-Control": TWIN_CACHE, "Access-Control-Allow-Origin": "*" },
  })
}
