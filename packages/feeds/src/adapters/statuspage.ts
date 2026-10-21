import { feedInfo } from "../info"
import { getJson, overlaps, type Adapter, type DateRange, type LoadContext } from "../source"
import type { Severity, WorldEvent } from "../types"

/**
 * Atlassian Statuspage, from two documents. `/api/v2/incidents.json` has the last 50 incidents with
 * exact times but covers only days to months. `history.json?page=N` (three calendar months per
 * page, current month on page 1) reaches back years but lags behind the newest incidents and leaves
 * some out. Both are read and merged by incident code: weeks inside the API's reach are complete,
 * older weeks get what the provider's history page shows. Storing each day's API read (the
 * world_events table) would make every week complete from then on.
 *
 * Severity is the impact the provider set: critical → critical, major → major, minor → minor.
 * "none" and scheduled maintenance are not events.
 */

interface HistoryIncident {
  code: string
  name: string
  impact: string
  /** "Oct <var data-var='date'>20</var>, <var data-var='time'>21:00</var> - Oct <var ...>21</var>, ... UTC" */
  timestamp: string
}

export interface StatuspageHistory {
  start_time: string
  end_time: string
  months: { name: string; year: number; incidents: HistoryIncident[] }[]
}

export interface StatuspageIncidents {
  incidents: { id: string; name: string; impact: string; created_at: string; started_at?: string | null; resolved_at?: string | null }[]
}

interface StatuspageSite {
  id: "stripe" | "cloudflare"
  /** The public v2 API's incident list. */
  api: string
  /** history.json base. Cloudflare's own domain hides it; its statuspage.io host serves it. */
  history: string
  /** Where incident pages live. */
  site: string
  source: string
}

export const statuspageSites: Record<StatuspageSite["id"], StatuspageSite> = {
  stripe: {
    id: "stripe",
    api: "https://www.stripestatus.com/api/v2/incidents.json",
    history: "https://www.stripestatus.com/history.json",
    site: "https://www.stripestatus.com",
    source: "Stripe Status",
  },
  cloudflare: {
    id: "cloudflare",
    api: "https://www.cloudflarestatus.com/api/v2/incidents.json",
    history: "https://yh6f0r4529hb.statuspage.io/history.json",
    site: "https://www.cloudflarestatus.com",
    source: "Cloudflare Status",
  },
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const impacts: Record<string, Severity> = { minor: "minor", major: "major", critical: "critical" }
/** Three years of pages is as far back as the ledger ever asks. */
const MAX_PAGE = 12

const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)

/** The history pages that hold every month of a range, at `now`. */
export function historyPages(range: DateRange, now: Date): number[] {
  const current = monthIndex(now.toISOString())
  const page = (date: string) => 1 + Math.floor((current - monthIndex(date)) / 3)
  const first = Math.max(1, page(range.to))
  const last = page(range.from)
  if (last > MAX_PAGE) throw new Error(`history before ${range.from.slice(0, 7)} is out of reach`)
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i)
}

const TIMESTAMP = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{2}):(\d{2})(?: - (?:([A-Z][a-z]{2}) (\d{1,2}), )?(\d{2}):(\d{2}))? UTC$/

/** Start and end dates of a history timestamp; the year comes from the month bucket it is listed under. */
export function parseHistoryTimestamp(raw: string, bucket: { name: string; year: number }): { date: string; end: string } | null {
  const text = raw.replace(/<\/?var[^>]*>/g, "").trim()
  const m = TIMESTAMP.exec(text)
  if (!m) return null
  const bucketMonth = MONTHS.indexOf(bucket.name.slice(0, 3))
  const startMonth = MONTHS.indexOf(m[1]!)
  if (startMonth < 0 || bucketMonth < 0) return null
  // An incident listed under January that started in December began the year before.
  const startYear = startMonth > bucketMonth + 1 ? bucket.year - 1 : bucket.year
  const date = iso(startYear, startMonth, Number(m[2]))
  if (!m[5]) return { date, end: date }
  const endMonth = MONTHS.indexOf(m[5])
  const endYear = endMonth < startMonth ? startYear + 1 : startYear
  return { date, end: iso(endYear, endMonth, Number(m[6])) }
}

/** Normalise one history page to events. Pure, for contract tests. */
export function statuspageEvents(site: StatuspageSite, page: StatuspageHistory): WorldEvent[] {
  const out: WorldEvent[] = []
  for (const month of page.months) {
    for (const i of month.incidents) {
      const severity = impacts[i.impact]
      const when = parseHistoryTimestamp(i.timestamp, month)
      if (!severity || !when) continue
      out.push({
        id: `${site.id}:${i.code}`,
        feed: site.id,
        date: when.date,
        end: when.end,
        source: site.source,
        title: i.name.trim(),
        url: `${site.site}/incidents/${i.code}`,
        severity,
        affects: feedInfo[site.id].affects,
      })
    }
  }
  return out
}

/** Normalise the v2 incident list. Pure, for contract tests. */
export function statuspageApiEvents(site: StatuspageSite, list: StatuspageIncidents): WorldEvent[] {
  return list.incidents.flatMap((i) => {
    const severity = impacts[i.impact]
    if (!severity) return []
    const date = (i.started_at ?? i.created_at).slice(0, 10)
    const end = i.resolved_at ? i.resolved_at.slice(0, 10) : null
    return [
      {
        id: `${site.id}:${i.id}`,
        feed: site.id,
        date,
        end: end && end >= date ? end : date,
        source: site.source,
        title: i.name.trim(),
        url: `${site.site}/incidents/${i.id}`,
        severity,
        affects: feedInfo[site.id].affects,
      },
    ]
  })
}

/** A page must be history JSON and start where page arithmetic says, or the weeks it fills would be wrong. */
function checkPage(page: StatuspageHistory, url: string, n: number, now: Date): StatuspageHistory {
  if (!page || !Array.isArray(page.months) || typeof page.start_time !== "string") throw new Error(`${url} is not a Statuspage history page`)
  const expected = monthIndex(now.toISOString()) - 3 * n + 1
  if (monthIndex(page.start_time) !== expected) throw new Error(`${url} starts ${page.start_time.slice(0, 7)}, not where page ${n} should`)
  return page
}

export function statuspageAdapter(id: StatuspageSite["id"]): Adapter {
  const site = statuspageSites[id]
  return {
    id,
    async load(range: DateRange, ctx: LoadContext) {
      const pages = historyPages(range, ctx.now)
      const loaded = await Promise.all([
        getJson<StatuspageIncidents>(ctx, site.api, feedInfo[id].revalidate).then((list) => {
          if (!list || !Array.isArray(list.incidents)) throw new Error(`${site.api} is not an incident list`)
          return statuspageApiEvents(site, list)
        }),
        ...pages.map(async (n) => {
          const url = `${site.history}?page=${n}`
          const page = checkPage(await getJson<StatuspageHistory>(ctx, url, feedInfo[id].revalidate), url, n, ctx.now)
          return statuspageEvents(site, page)
        }),
      ])
      // The API comes first, so its exact times win over the history's day-level ones.
      const seen = new Set<string>()
      const events = loaded.flat().filter((e) => overlaps(e, range) && !seen.has(e.id) && seen.add(e.id))
      return { events }
    },
  }
}
