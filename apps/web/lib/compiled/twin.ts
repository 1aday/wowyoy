import { absolute, robotsHeader, type PageContext } from "@workspace/compiler"

/** Content types for every machine-readable surface, with their charset. */
export const contentTypes = {
  md: "text/markdown; charset=utf-8",
  json: "application/json; charset=utf-8",
  yaml: "application/yaml; charset=utf-8",
  txt: "text/plain; charset=utf-8",
} as const

/** Compiled at build and identical until the next deploy, which purges the CDN. */
export const TWIN_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"

/** A file twin: its body, the canonical page it mirrors and that page's indexing state. */
export function twinResponse(body: string, type: keyof typeof contentTypes, page: PageContext, filename: string) {
  return new Response(body, {
    headers: {
      "Content-Type": contentTypes[type],
      "Content-Disposition": `inline; filename="${filename}"`,
      Link: `<${absolute(page.path)}>; rel="canonical"`,
      "X-Robots-Tag": robotsHeader(page),
      "Cache-Control": TWIN_CACHE,
      "Access-Control-Allow-Origin": "*",
    },
  })
}

export function notFound(what = "Not found.") {
  return new Response(`${what}\n`, {
    status: 404,
    headers: { "Content-Type": contentTypes.txt, "X-Robots-Tag": "noindex", "Cache-Control": "public, max-age=60" },
  })
}
