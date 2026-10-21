import { feedInfo } from "../info"
import { getJson, overlaps, windowStart, type DateRange, type LoadContext, type Loaded } from "../source"
import type { FeedId, Severity, WorldEvent } from "../types"

/**
 * Google's status dashboards publish `incidents.json` for the last 365 days.
 *
 * Search (status.search.google.com): announced ranking updates (core, spam, Discover...) are
 * major, since each can move organic traffic for weeks. Crawling, indexing and serving incidents
 * map by Google's own severity: high → critical, medium → major, low → minor.
 *
 * Ads (ads.google.com/status/publisher, which also lists the advertiser products): only the
 * products an advertiser buys through count (Google Ads, its API, Search Ads 360, Display & Video
 * 360); publisher products like AdMob and Ad Manager don't move a merchant's numbers. Same severity
 * mapping as Search incidents.
 */

export interface GoogleIncident {
  id: string
  begin: string
  end?: string | null
  external_desc: string
  status_impact?: string
  severity?: string
  affected_products?: { title: string; id: string }[]
  uri: string
}

export const GOOGLE_WINDOW_DAYS = 365
export const googleSearchUrl = "https://status.search.google.com/incidents.json"
export const googleAdsUrl = "https://ads.google.com/status/publisher/incidents.json"
export const ADVERTISER_PRODUCTS = new Set(["Google Ads", "Google Ads API", "Search Ads 360", "Display & Video 360"])

const bySeverity: Record<string, Severity> = { high: "critical", medium: "major", low: "minor" }
const impactWord: Record<string, string> = { SERVICE_OUTAGE: "outage", SERVICE_DISRUPTION: "disruption", SERVICE_INFORMATION: "issue" }

const products = (i: GoogleIncident) => (i.affected_products ?? []).map((p) => p.title.trim()).filter(Boolean)
const firstLine = (s: string) => s.split("\n")[0]!.trim().replace(/\.$/, "")
const day = (t: string) => new Date(t).toISOString().slice(0, 10)

function event(feed: FeedId, base: string, source: string, i: GoogleIncident, title: string, severity: Severity): WorldEvent {
  return {
    id: `${feed}:google:${i.id}`,
    feed,
    date: day(i.begin),
    end: i.end ? day(i.end) : null,
    source,
    title,
    url: `${base}/${i.uri}`,
    severity,
    affects: feedInfo[feed].affects,
  }
}

export function googleSearchEvents(list: GoogleIncident[]): WorldEvent[] {
  return list.map((i) => {
    const names = products(i)
    if (names.includes("Ranking")) return event("google-search", "https://status.search.google.com", "Google Search Status", i, firstLine(i.external_desc), "major")
    const what = names.length ? names.map((n) => n.toLowerCase()).join(", ") : "service"
    const title = `Search ${what} ${impactWord[i.status_impact ?? ""] ?? "issue"}`
    return event("google-search", "https://status.search.google.com", "Google Search Status", i, title, bySeverity[i.severity ?? ""] ?? "minor")
  })
}

export function googleAdsEvents(list: GoogleIncident[]): WorldEvent[] {
  return list.flatMap((i) => {
    const names = products(i).filter((n) => ADVERTISER_PRODUCTS.has(n))
    if (!names.length) return []
    const title = `${names.join(", ")} ${impactWord[i.status_impact ?? ""] ?? "issue"}`
    return [event("ad-platforms", "https://ads.google.com/status/publisher", "Google Ads Status", i, title, bySeverity[i.severity ?? ""] ?? "minor")]
  })
}

function checkList(list: unknown, url: string): GoogleIncident[] {
  if (!Array.isArray(list)) throw new Error(`${url} is not an incident list`)
  return list as GoogleIncident[]
}

export async function loadGoogleSearch(range: DateRange, ctx: LoadContext): Promise<Loaded> {
  const list = checkList(await getJson(ctx, googleSearchUrl, feedInfo["google-search"].revalidate), googleSearchUrl)
  return { events: googleSearchEvents(list).filter((e) => overlaps(e, range)), since: windowStart(ctx.now, GOOGLE_WINDOW_DAYS) }
}

export async function loadGoogleAds(range: DateRange, ctx: LoadContext): Promise<Loaded> {
  const list = checkList(await getJson(ctx, googleAdsUrl, feedInfo["ad-platforms"].revalidate), googleAdsUrl)
  return { events: googleAdsEvents(list).filter((e) => overlaps(e, range)), since: windowStart(ctx.now, GOOGLE_WINDOW_DAYS) }
}
