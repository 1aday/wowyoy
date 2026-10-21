/**
 * World feeds: the outside causes a weekly number can't see. Each adapter is deliberately dumb:
 * fetch a public source, normalise to WorldEvent, never summarise with a model. A feed that
 * fails reports "unavailable" for that week rather than showing stale events.
 */

export const feedIds = ["stripe", "cloudflare", "google-search", "app-stores", "holidays", "shopping", "ad-platforms", "dst"] as const
export type FeedId = (typeof feedIds)[number]

export type Severity = "minor" | "major" | "critical"

export interface WorldEvent {
  /** Stable id: `${feed}:${source id}`. */
  id: string
  feed: FeedId
  /** UTC date the event started, YYYY-MM-DD. */
  date: string
  /** UTC end date when known. */
  end?: string | null
  /** Who published it: "Stripe status", "Google Search Status Dashboard". */
  source: string
  title: string
  url: string
  severity: Severity
  /** Standard metric ids this kind of event can move. */
  affects: string[]
  /** Where it applies, as ISO country codes ("EU" for the EU clock rule); absent = everywhere. */
  regions?: string[]
}

export interface FeedResult {
  feed: FeedId
  status: "ok" | "unavailable"
  /** When the source was read, ISO. */
  fetchedAt: string
  events: WorldEvent[]
  /** Why it is unavailable, for logs; never shown as an event. */
  error?: string
}

export interface FeedInfo {
  id: FeedId
  name: string
  /** Human URL of the source, linked on the week page. */
  home: string
  /** How often the source is pulled, in seconds (used as fetch revalidate). */
  revalidate: number
  affects: string[]
}
