import type { FeedId, Severity, WorldEvent } from "./types"

/** RequestInit plus Next's `next` option, passed through untouched so Next caches each source. */
export type FetchInit = RequestInit & { next?: { revalidate?: number | false; tags?: string[] } }
export type FetchLike = (input: string, init?: FetchInit) => Promise<Response>

/** Inclusive UTC date range, YYYY-MM-DD. */
export interface DateRange {
  from: string
  to: string
}

export interface LoadContext {
  fetch: FetchLike
  now: Date
  /** Per request; default SOURCE_TIMEOUT_MS. */
  timeoutMs?: number
}

export interface Loaded {
  events: WorldEvent[]
  /** First date the source can answer for; weeks that start earlier come back unavailable. */
  since?: string
}

/** One world feed: read a public source and normalise it. Throws when the source can't answer. */
export interface Adapter {
  id: FeedId
  load(range: DateRange, ctx: LoadContext): Promise<Loaded>
}

export const SOURCE_TIMEOUT_MS = 8000
/** Next cache tag on every source read, so a cron can force fresh reads. */
export const FEEDS_TAG = "feeds"
const USER_AGENT = "wowyoy-ledger/1 (+https://wowyoy.com/w)"

const DAY = 864e5
export const ymd = (t: number | Date) => new Date(+t).toISOString().slice(0, 10)
export const addDays = (date: string, days: number) => ymd(Date.parse(`${date}T00:00:00Z`) + days * DAY)
/** The trailing window a dashboard keeps, as the first date it still lists. */
export const windowStart = (now: Date, days: number) => ymd(+now - days * DAY)

export const severityRank: Record<Severity, number> = { minor: 0, major: 1, critical: 2 }

async function get(ctx: LoadContext, url: string, revalidate: number, accept: string) {
  const res = await ctx.fetch(url, {
    headers: { accept, "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(ctx.timeoutMs ?? SOURCE_TIMEOUT_MS),
    next: { revalidate, tags: [FEEDS_TAG] },
  })
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`)
  return res
}

export async function getJson<T>(ctx: LoadContext, url: string, revalidate: number): Promise<T> {
  return (await (await get(ctx, url, revalidate, "application/json")).json()) as T
}

export async function getText(ctx: LoadContext, url: string, revalidate: number): Promise<string> {
  return (await get(ctx, url, revalidate, "application/rss+xml, application/xml, text/xml")).text()
}

/** Whether an event touches a date range (single-day events end where they start). */
export const overlaps = (e: Pick<WorldEvent, "date" | "end">, r: DateRange) => e.date <= r.to && (e.end ?? e.date) >= r.from

export const byDateThenSeverity = (a: WorldEvent, b: WorldEvent) =>
  a.date.localeCompare(b.date) || severityRank[b.severity] - severityRank[a.severity] || a.id.localeCompare(b.id)
