import { llmsFullTxt } from "@workspace/compiler"
import { publishedSpecs } from "@workspace/metrics"
import { TWIN_CACHE, contentTypes } from "@/lib/compiled/twin"

/** Every published Standard page as one Markdown text. */

export const dynamic = "force-static"
export const revalidate = false

export function GET() {
  return new Response(llmsFullTxt(publishedSpecs()), {
    headers: { "Content-Type": contentTypes.txt, "Cache-Control": TWIN_CACHE, "Access-Control-Allow-Origin": "*" },
  })
}
