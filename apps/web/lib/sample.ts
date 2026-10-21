import { generateStore, isoMonday, fmtDate, type MetricWeek } from "@workspace/metrics"
import type { DiscoveredEvent, Mapping } from "@workspace/sources"

/** The sample workspace: a DTC store on seeded data, ending at the last complete week. */
export function sampleRows(): MetricWeek[] {
  const end = fmtDate(new Date(isoMonday(new Date()).getTime() - 7 * 864e5))
  return generateStore({ endWeek: end }).map((r) => ({ week: r.week, values: r.values }))
}

/** What Claude proposed for the sample store's (fictional) PostHog events. */
export const sampleMapping: Mapping = {
  newCustomers: true,
  sessions: { event: "$pageview", confidence: 0.98, source: "claude", reason: "Web store; $pageview carries $session_id on every visit." },
  product_views: { event: "product_viewed", confidence: 0.96, source: "claude", reason: "Fires on product pages with product_id and price." },
  carts: { event: "product_added", confidence: 0.95, source: "claude", reason: "Segment ecommerce name; fires once per add with quantity." },
  checkouts: { event: "checkout_started", confidence: 0.93, source: "claude", reason: "Fires on the first checkout step, before shipping." },
  orders: {
    event: "order_completed",
    confidence: 0.97,
    source: "claude",
    reason: "Server-side event with order_id; preferred over the /thank-you pageview, which double counts reloads.",
  },
  revenue: {
    event: "order_completed",
    property: "total",
    confidence: 0.9,
    source: "claude",
    reason: "total is net of discounts and excludes tax; subtotal ignores discounts.",
  },
  spend: { event: "ad_spend_synced", property: "spend", confidence: 0.82, source: "you", reason: "Daily spend imported from Meta and Google Ads." },
}

export const sampleEvents: DiscoveredEvent[] = [
  { event: "$pageview", events: 4_812_330, sessions: 2_604_118 },
  { event: "$autocapture", events: 3_201_904, sessions: 1_904_772 },
  { event: "product_viewed", events: 2_390_211, sessions: 1_611_052 },
  { event: "product_added", events: 214_998, sessions: 171_204 },
  { event: "checkout_started", events: 96_402, sessions: 88_930 },
  { event: "order_completed", events: 57_118, sessions: 56_870 },
  { event: "ad_spend_synced", events: 30, sessions: 0 },
]
