import { revalidatePath } from "next/cache"
import { closesAt, isoWeekOf, shiftWeek } from "@workspace/metrics"
import { cronAuthorized, unauthorized } from "@/lib/ledger/cron"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * Monday, 06:00 UTC: last week just closed. Refresh the new week page, its twin and og card, and the
 * newly open week. The archive, the RSS and the week before (its "next" link) refresh on their own
 * timers: revalidating them here would make them re-read every frozen week.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return unauthorized()
  const closed = shiftWeek(isoWeekOf(new Date()), -1)
  // A cron can fire a little early; never refresh a page before its week has actually closed.
  const wait = +closesAt(closed) - Date.now()
  if (wait > 0 && wait < 90_000) await new Promise((r) => setTimeout(r, wait + 1000))
  if (Date.now() < +closesAt(closed)) return Response.json({ ok: false, error: `${closed.id} has not closed yet` }, { status: 409 })

  const open = shiftWeek(closed, 1)
  const pages = [`/api/twin/w/${closed.id}`, `/w/${open.id}`]
  for (const p of pages) revalidatePath(p)
  // As a layout path it also refreshes the week's og card, which may hold the open-week card.
  revalidatePath(`/w/${closed.id}`, "layout")
  pages.push(`/w/${closed.id}`)
  return Response.json({ ok: true, closed: closed.id, revalidated: pages })
}
