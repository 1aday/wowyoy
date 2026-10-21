import { revalidatePath } from "next/cache"
import { closesAt, isoWeekOf, shiftWeek } from "@workspace/metrics"
import { cronAuthorized, unauthorized } from "@/lib/ledger/cron"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * Monday, 06:00 UTC: last week just closed. Refresh the archive, the new week page and its twin,
 * the week before it (its "next" link now exists), the newly open week, and the feed.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return unauthorized()
  const closed = shiftWeek(isoWeekOf(new Date()), -1)
  // A cron can fire a little early; never refresh a page before its week has actually closed.
  const wait = +closesAt(closed) - Date.now()
  if (wait > 0 && wait < 90_000) await new Promise((r) => setTimeout(r, wait + 1000))
  if (Date.now() < +closesAt(closed)) return Response.json({ ok: false, error: `${closed.id} has not closed yet` }, { status: 409 })

  const open = shiftWeek(closed, 1)
  const before = shiftWeek(closed, -1)
  const pages = ["/w", `/api/twin/w/${closed.id}`, `/w/${before.id}`, `/w/${open.id}`, "/w/rss.xml"]
  for (const p of pages) revalidatePath(p)
  // As a layout path it also refreshes the week's og card, which may hold the open-week card.
  revalidatePath(`/w/${closed.id}`, "layout")
  pages.push(`/w/${closed.id}`)
  return Response.json({ ok: true, closed: closed.id, revalidated: pages })
}
