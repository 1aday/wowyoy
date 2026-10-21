import { movesFeed } from "@/lib/gh/moves"

/** Reading every watched repo cold can take a while; warm reads come from the hour-long data cache. */
export const maxDuration = 300

/** Last week's real moves in the watched repos, as JSON. Cached an hour at the edge. */
export async function GET() {
  const feed = await movesFeed()
  return Response.json(feed, {
    headers: {
      "Cache-Control": feed.missing ? "public, max-age=300, s-maxage=300" : "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex",
    },
  })
}
