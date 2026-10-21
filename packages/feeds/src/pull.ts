import type { IsoWeek } from "@workspace/metrics"
import type { FeedId, FeedResult } from "./types"

export interface PullOptions {
  /** Only these feeds. Default: all. */
  feeds?: readonly FeedId[]
  /** fetch implementation, for tests. */
  fetch?: typeof fetch
}

/**
 * Every feed's events inside one ISO week. Never throws: a feed that fails comes back
 * as status "unavailable" with no events. Placeholder until the Ledger build implements the adapters.
 */
export async function pullWeek(_week: IsoWeek, opts: PullOptions = {}): Promise<FeedResult[]> {
  const now = new Date().toISOString()
  const ids: readonly FeedId[] = opts.feeds ?? []
  return ids.map((feed) => ({ feed, status: "unavailable" as const, fetchedAt: now, events: [], error: "not implemented" }))
}
