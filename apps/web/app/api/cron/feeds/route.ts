import { revalidatePath } from "next/cache"
import { isoWeekOf, latestClosedWeek } from "@workspace/metrics"
import { cronAuthorized, unauthorized } from "@/lib/ledger/cron"
import { feedsForWeeks } from "@/lib/ledger/feeds"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Daily, 05:00 UTC: read every source fresh for the open week and the latest closed one, then refresh the latest week's pages. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return unauthorized()
  const now = new Date()
  const latest = latestClosedWeek(now)
  const current = isoWeekOf(now)
  const [open, closed] = await feedsForWeeks([current, latest], now, { fresh: true })
  // Only the latest week's own pages: revalidating /w or the RSS would make them re-read every archived week.
  const pages = [`/w/${latest.id}`, `/api/twin/w/${latest.id}`]
  for (const p of pages) revalidatePath(p)
  const summary = (results: typeof open) => Object.fromEntries((results ?? []).map((r) => [r.feed, r.status === "ok" ? r.events.length : (r.error ?? "unavailable")]))
  return Response.json({ ok: true, weeks: { [current.id]: summary(open), [latest.id]: summary(closed) }, revalidated: pages })
}
