import { unstable_cache } from "next/cache"
import { pullWeek, type FeedResult, type FetchLike, type PullOptions } from "@workspace/feeds"
import { FIXTURES_RECORDED_AT, fixtureFetch } from "@workspace/feeds/fixtures"
import type { IsoWeek } from "@workspace/metrics"
import { isSettled } from "./archive"

/** WOWYOY_FEED_FIXTURES=1 reads recorded sources instead of the network (e2e, offline work). */
export const fixtureMode = () => process.env.WOWYOY_FEED_FIXTURES === "1"

/** Bump when adapter output changes, so frozen weeks are written again. */
const FROZEN_VERSION = "v1"

/**
 * One read per source URL for the length of a request, however many weeks ask. Responses are
 * buffered so every caller gets a fresh body. Under it, Next's fetch cache keeps each source for
 * its feed's `revalidate`.
 */
function memoFetch(fresh = false): FetchLike {
  const seen = new Map<string, Promise<{ status: number; type: string; body: string }>>()
  return async (input, init) => {
    let hit = seen.get(input)
    if (!hit) {
      // A fresh read skips Next's fetch cache for this request only, so no shared tag has to expire.
      hit = fetch(input, fresh ? { ...init, cache: "no-store", next: undefined } : init).then(async (r) => ({ status: r.status, type: r.headers.get("content-type") ?? "", body: await r.text() }))
      seen.set(input, hit)
      hit.catch(() => seen.delete(input))
    }
    const r = await hit
    return new Response(r.body, { status: r.status, headers: { "content-type": r.type } })
  }
}

class Incomplete extends Error {
  constructor(readonly results: FeedResult[]) {
    super("a feed was unavailable")
  }
}

/**
 * Feeds for many weeks at once. A settled week whose every feed answered is frozen in Next's data
 * cache (no revalidation), so its page never changes even after a source's history window moves
 * past it. Weeks still settling, or with a feed down, are read live and tried again next time.
 * Frozen entries live until a render path they belong to is revalidated on demand, so the crons
 * only ever revalidate the pages of weeks still inside every source's window; the index and RSS
 * refresh on their own timer. A database table replaces this when there is one.
 */
export async function feedsForWeeks(weeks: readonly IsoWeek[], now = new Date(), { fresh = false } = {}): Promise<FeedResult[][]> {
  const fixtures = fixtureMode()
  const opts: PullOptions = fixtures ? { fetch: fixtureFetch, now: FIXTURES_RECORDED_AT } : { fetch: memoFetch(fresh) }
  return Promise.all(
    weeks.map(async (week) => {
      if (!isSettled(week, now)) return pullWeek(week, opts)
      const frozen = unstable_cache(
        async () => {
          const results = await pullWeek(week, opts)
          // A source whose public history starts after this week will never answer for it, so it doesn't hold the week open.
          if (results.some((r) => r.status === "unavailable" && !r.error?.startsWith("source history starts"))) throw new Incomplete(results)
          return results
        },
        ["ledger-week", FROZEN_VERSION, fixtures ? "fixtures" : "live", week.id],
        { revalidate: false, tags: ["ledger", `ledger:${week.id}`] },
      )
      try {
        return await frozen()
      } catch (err) {
        if (err instanceof Incomplete) return err.results
        return pullWeek(week, opts)
      }
    }),
  )
}

export async function feedsForWeek(week: IsoWeek, now = new Date()): Promise<FeedResult[]> {
  return (await feedsForWeeks([week], now))[0] ?? []
}
