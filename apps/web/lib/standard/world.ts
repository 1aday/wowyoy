import { feedIds, feedInfo, pullWeek, type FeedId, type FeedResult } from "@workspace/feeds"
import type { IsoWeek, MetricSpec } from "@workspace/metrics"

/** The feeds a Why page reads: the spec's driver feeds first, then every feed that lists the metric as one it can move. */
export function worldFeeds(spec: Pick<MetricSpec, "id">, driverFeeds: readonly FeedId[]): FeedId[] {
  const listed = feedIds.filter((f) => feedInfo[f].affects.includes(spec.id))
  return [...new Set<FeedId>([...driverFeeds, ...listed])]
}

/** pullWeek with a time limit, so a slow source can never hold a page render. Late or failed feeds read as unavailable. */
export async function pullWorld(week: IsoWeek, feeds: readonly FeedId[], ms = 8000): Promise<FeedResult[]> {
  if (!feeds.length) return []
  const unavailable = (error: string): FeedResult[] =>
    feeds.map((feed) => ({ feed, status: "unavailable", fetchedAt: new Date().toISOString(), events: [], error }))
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<FeedResult[]>((resolve) => {
    timer = setTimeout(() => resolve(unavailable("timed out")), ms)
  })
  try {
    const results = await Promise.race([pullWeek(week, { feeds }).catch((e: unknown) => unavailable(String(e))), timeout])
    // Keep the page's order and give every requested feed a row, even if the puller skipped one.
    const missing = unavailable("missing")
    return feeds.map((f, i) => results.find((r) => r.feed === f) ?? missing[i]!)
  } finally {
    clearTimeout(timer)
  }
}
