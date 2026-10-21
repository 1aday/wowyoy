import { feedInfo } from "../info"
import { getJson, overlaps, windowStart, type DateRange, type LoadContext, type Loaded } from "../source"
import type { Severity, WorldEvent } from "../types"

/**
 * Meta Status (metastatus.com) serves each product's last 365 days of outages as JSON, the same
 * file its own page renders. Only Facebook Ads Manager is read: Ads Delivery, Ads Creation and
 * Editing, Ads Reporting.
 *
 * Severity: Ads Delivery maps Meta's level directly (High → critical, Medium → major, Low → minor).
 * Creation and reporting outages don't stop ads from serving, so they sit one level lower
 * (High → major, otherwise minor).
 */

export interface MetaOutage {
  id: number
  org_id: string
  service_id: number
  status: string
  time: string
  posts: { id: number; status: string; time: string }[]
}

export const META_WINDOW_DAYS = 365
export const metaAdsUrl = "https://metastatus.com/data/outages/ads-manager.history.json"
const ADS_DELIVERY = 6
const services: Record<number, string> = { 5: "Ads creation and editing", 6: "Ads delivery", 7: "Ads reporting" }
const levels: Record<string, number> = { "Low disruptions": 1, "Medium disruptions": 2, "High disruptions": 3 }
const delivery: Severity[] = ["minor", "minor", "major", "critical"]
const other: Severity[] = ["minor", "minor", "minor", "major"]

export function metaEvents(list: MetaOutage[]): WorldEvent[] {
  return list.flatMap((o) => {
    const posts = [...(o.posts ?? [])].sort((a, b) => a.time.localeCompare(b.time))
    const first = posts[0]
    if (!first) return []
    const level = Math.max(0, ...posts.map((p) => levels[p.status] ?? 0))
    const resolved = [...posts].reverse().find((p) => p.status === "Resolved")
    const service = services[o.service_id] ?? "Ads Manager"
    return [
      {
        id: `ad-platforms:meta:${o.id}`,
        feed: "ad-platforms" as const,
        date: first.time.slice(0, 10),
        end: resolved ? resolved.time.slice(0, 10) : null,
        source: "Meta Status",
        title: `Meta ${service.toLowerCase()} disruption`,
        url: "https://metastatus.com/ads-manager",
        severity: (o.service_id === ADS_DELIVERY ? delivery : other)[level]!,
        affects: feedInfo["ad-platforms"].affects,
      },
    ]
  })
}

export async function loadMetaAds(range: DateRange, ctx: LoadContext): Promise<Loaded> {
  const list = await getJson<MetaOutage[]>(ctx, metaAdsUrl, feedInfo["ad-platforms"].revalidate)
  if (!Array.isArray(list)) throw new Error(`${metaAdsUrl} is not an outage list`)
  return { events: metaEvents(list).filter((e) => overlaps(e, range)), since: windowStart(ctx.now, META_WINDOW_DAYS) }
}
