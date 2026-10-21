import type { NextRequest } from "next/server"
import { badgeRead, type BadgeRead } from "@workspace/feeds/github/read"
import { isRepoMeasure, measureInfo } from "@workspace/feeds/github/types"
import { getRepoPulse } from "@/lib/gh/data"
import { badgeSizes, badgeThemes, renderBadge, type BadgeSize, type BadgeTheme } from "@/lib/gh/badge"

const HOUR = "public, max-age=3600, s-maxage=3600"
const SOON = "public, max-age=300, s-maxage=300"

/** The README badge. Always a 200 image (a broken image helps nobody), never indexed, cached an hour by browsers, CDNs and GitHub's proxy. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await ctx.params
  const q = req.nextUrl.searchParams
  const theme = (badgeThemes as readonly string[]).includes(q.get("theme") ?? "") ? (q.get("theme") as BadgeTheme) : "light"
  const size = (badgeSizes as readonly string[]).includes(q.get("size") ?? "") ? (q.get("size") as BadgeSize) : "sm"
  const asked = q.get("measure")
  const measure = isRepoMeasure(asked) ? asked : undefined

  const res = await getRepoPulse(owner, repo)
  const label = measure ? measureInfo[measure].label : "repo pulse"
  let read: Pick<BadgeRead, "label" | "value" | "dir" | "tone">
  let cache = HOUR
  if (res.status === "ok") read = badgeRead(res.pulse, measure)
  else if (res.status === "not-found") read = { label, value: "repo not found", dir: null, tone: "muted" }
  else if (res.status === "opted-out") read = { label, value: "opted out", dir: null, tone: "muted" }
  else {
    read = { label, value: "unavailable", dir: null, tone: "muted" }
    cache = SOON
  }

  return new Response(renderBadge(read, { theme, size }), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": cache,
      "X-Robots-Tag": "noindex",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
