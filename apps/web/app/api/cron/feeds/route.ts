import { revalidatePath, revalidateTag } from "next/cache"
import { FEEDS_TAG } from "@workspace/feeds"
import { isoWeekOf, latestClosedWeek } from "@workspace/metrics"
import { cronAuthorized, unauthorized } from "@/lib/ledger/cron"
import { feedsForWeeks } from "@/lib/ledger/feeds"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Daily, 05:00 UTC: read every source fresh for the open week and the latest closed one, then refresh their pages. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return unauthorized()
  const now = new Date()
  const latest = latestClosedWeek(now)
  const current = isoWeekOf(now)
  revalidateTag(FEEDS_TAG, { expire: 0 })
  const [open, closed] = await feedsForWeeks([current, latest], now)
  const pages = ["/w", `/w/${latest.id}`, `/api/twin/w/${latest.id}`, "/w/rss.xml"]
  for (const p of pages) revalidatePath(p)
  const summary = (results: typeof open) => Object.fromEntries((results ?? []).map((r) => [r.feed, r.status === "ok" ? r.events.length : (r.error ?? "unavailable")]))
  return Response.json({ ok: true, weeks: { [current.id]: summary(open), [latest.id]: summary(closed) }, revalidated: pages })
}
