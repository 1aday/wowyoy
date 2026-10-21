import type { DiscoveredEvent } from "./posthog"
import { mappedMeasures, type Mapping, type MappedMeasure, type MeasureSpec } from "./mapping"

/**
 * The rule mapper: matches common event names from the Segment ecommerce spec, GA4, Shopify
 * and PostHog's own conventions. It runs first, always; Claude reviews and improves on it.
 */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

const names: Record<Exclude<MappedMeasure, "revenue" | "spend">, string[]> = {
  sessions: ["$pageview", "$screen"],
  product_views: ["product_viewed", "view_item", "product_view", "viewed_product", "product_page_viewed", "item_viewed"],
  carts: ["product_added", "add_to_cart", "added_to_cart", "cart_add", "add_item_to_cart", "item_added_to_cart"],
  checkouts: ["checkout_started", "begin_checkout", "initiate_checkout", "started_checkout", "checkout_initiated", "checkout_begin"],
  orders: ["order_completed", "purchase", "purchased", "order_placed", "checkout_completed", "order_created", "payment_completed", "completed_order"],
}

const revenueProps = ["revenue", "$revenue", "total", "total_price", "order_total", "value", "amount", "price", "subtotal", "total_amount"]

function bestEvent(events: DiscoveredEvent[], candidates: string[]) {
  const wanted = candidates.map(norm)
  for (const [rank, w] of wanted.entries()) {
    const hit = events.find((e) => norm(e.event) === w)
    if (hit) return { event: hit.event, confidence: rank === 0 ? 0.9 : 0.85 }
  }
  for (const w of wanted) {
    const hit = events.find((e) => !e.event.startsWith("$") && norm(e.event).includes(w))
    if (hit) return { event: hit.event, confidence: 0.6 }
  }
  return null
}

export function ruleMapping(events: DiscoveredEvent[]): Mapping {
  const mapping: Mapping = { newCustomers: true }
  for (const m of mappedMeasures) {
    if (m === "revenue" || m === "spend") continue
    const hit = bestEvent(events, names[m])
    if (hit) mapping[m] = { ...hit, source: "rules", reason: `Matched the common event name "${hit.event}".` } satisfies MeasureSpec
  }
  if (!mapping.product_views && mapping.sessions?.event === "$pageview") {
    const pv = events.find((e) => e.event === "$pageview")
    if (pv?.properties?.some((p) => p.key === "$current_url" && /\/products?\//.test(p.example ?? ""))) {
      mapping.product_views = {
        event: "$pageview",
        filter: { property: "$current_url", op: "contains", value: "/products/" },
        confidence: 0.7,
        source: "rules",
        reason: "Pageviews on /products/ URLs.",
      }
    }
  }
  if (mapping.orders) {
    const ev = events.find((e) => e.event === mapping.orders!.event)
    const numeric = new Set(ev?.properties?.filter((p) => p.numeric).map((p) => p.key) ?? [])
    const property = revenueProps.find((p) => numeric.has(p))
    if (property) {
      mapping.revenue = {
        event: mapping.orders.event,
        property,
        confidence: 0.8,
        source: "rules",
        reason: `Summed "${property}" on ${mapping.orders.event}.`,
      }
    }
  }
  return mapping
}
