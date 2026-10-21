import type { IsoWeek } from "@workspace/metrics"
import { loadApple } from "./adapters/apple"
import { loadDst, loadHolidays, loadShopping } from "./adapters/calendar"
import { loadGoogleAds, loadGoogleSearch } from "./adapters/google-status"
import { loadMetaAds } from "./adapters/meta-status"
import { statuspageAdapter } from "./adapters/statuspage"
import { byDateThenSeverity, overlaps, type Adapter, type FetchLike, type LoadContext, type Loaded } from "./source"
import { feedIds, type FeedId, type FeedResult } from "./types"

export interface PullOptions {
  /** Only these feeds. Default: all. */
  feeds?: readonly FeedId[]
  /** fetch implementation, for tests and fixture mode. Default: global fetch, which Next caches per source. */
  fetch?: typeof fetch | FetchLike
  /** The clock sources are read against (their trailing windows). Default: now. */
  now?: Date
  /** Per-source timeout in ms. */
  timeoutMs?: number
}

/** Both ad platforms must answer, or the feed is unavailable: half a feed would read as "no outages". */
async function loadAdPlatforms(range: Parameters<Adapter["load"]>[0], ctx: LoadContext): Promise<Loaded> {
  const parts = await Promise.all([loadGoogleAds(range, ctx), loadMetaAds(range, ctx)])
  const since = parts.map((p) => p.since).reduce((a, b) => (a && b ? (a > b ? a : b) : (a ?? b)))
  return { events: parts.flatMap((p) => p.events), since }
}

export const adapters: Record<FeedId, Adapter> = {
  stripe: statuspageAdapter("stripe"),
  cloudflare: statuspageAdapter("cloudflare"),
  "google-search": { id: "google-search", load: loadGoogleSearch },
  "app-stores": { id: "app-stores", load: loadApple },
  "ad-platforms": { id: "ad-platforms", load: loadAdPlatforms },
  holidays: { id: "holidays", load: loadHolidays },
  shopping: { id: "shopping", load: loadShopping },
  dst: { id: "dst", load: loadDst },
}

const defaultFetch: FetchLike = (input, init) => fetch(input, init)

/**
 * Every feed's events for several ISO weeks, one read per source. Results line up with `weeks`.
 * Never throws: a feed that fails, or whose history doesn't reach a week, is "unavailable" for
 * that week with no events, never stale ones.
 *
 * There is no database yet, so sources are read at render time and Next's fetch cache keeps
 * them for each feed's `revalidate`. The output is the row shape a `world_events` table would hold.
 */
export async function pullWeeks(weeks: readonly IsoWeek[], opts: PullOptions = {}): Promise<FeedResult[][]> {
  const ids = opts.feeds ?? feedIds
  if (!weeks.length) return []
  const ctx: LoadContext = { fetch: (opts.fetch ?? defaultFetch) as FetchLike, now: opts.now ?? new Date(), timeoutMs: opts.timeoutMs }
  const range = {
    from: weeks.reduce((min, w) => (w.monday < min ? w.monday : min), weeks[0]!.monday),
    to: weeks.reduce((max, w) => (w.sunday > max ? w.sunday : max), weeks[0]!.sunday),
  }
  const loaded = await Promise.all(
    ids.map(async (feed) => {
      try {
        return { feed, ok: true as const, data: await adapters[feed].load(range, ctx), fetchedAt: new Date().toISOString() }
      } catch (err) {
        return { feed, ok: false as const, error: err instanceof Error ? err.message : String(err), fetchedAt: new Date().toISOString() }
      }
    }),
  )
  return weeks.map((week) =>
    loaded.map((l): FeedResult => {
      if (!l.ok) return { feed: l.feed, status: "unavailable", fetchedAt: l.fetchedAt, events: [], error: l.error }
      if (l.data.since && week.monday < l.data.since) {
        return { feed: l.feed, status: "unavailable", fetchedAt: l.fetchedAt, events: [], error: `source history starts ${l.data.since}` }
      }
      const span = { from: week.monday, to: week.sunday }
      return { feed: l.feed, status: "ok", fetchedAt: l.fetchedAt, events: l.data.events.filter((e) => overlaps(e, span)).sort(byDateThenSeverity) }
    }),
  )
}

/** Every feed's events inside one ISO week. Never throws (see `pullWeeks`). */
export async function pullWeek(week: IsoWeek, opts: PullOptions = {}): Promise<FeedResult[]> {
  return (await pullWeeks([week], opts))[0] ?? []
}
