import type { MetricId } from "./catalog"

/**
 * One week of canonical metrics, from any source (sample store, PostHog, a CSV).
 * A metric the source can't provide is simply absent; every reader skips it.
 */
export interface MetricWeek {
  /** Monday of the ISO week, YYYY-MM-DD */
  week: string
  values: Partial<Record<MetricId, number>>
}

/** The raw weekly measures a source supplies; rates and ratios are derived from them. */
export const baseMeasures = [
  "sessions",
  "product_views",
  "carts",
  "checkouts",
  "orders",
  "revenue",
  "new_customers",
  "spend",
] as const
export type BaseMeasure = (typeof baseMeasures)[number]

export type MeasureWeek = { week: string } & Partial<Record<BaseMeasure, number>>

const ratio = (a: number | undefined, b: number | undefined) => (a != null && b != null && b > 0 ? a / b : undefined)

/** Turn raw weekly measures into canonical metrics with fixed formulas. No metric is computed any other way. */
export function deriveMetrics(m: MeasureWeek): MetricWeek {
  const repeat = m.orders != null && m.new_customers != null ? Math.max(0, m.orders - m.new_customers) : undefined
  const values: MetricWeek["values"] = {
    sessions: m.sessions,
    product_view_rate: ratio(m.product_views, m.sessions),
    add_to_cart_rate: ratio(m.carts, m.product_views ?? m.sessions),
    checkout_start_rate: ratio(m.checkouts, m.carts),
    checkout_completion_rate: ratio(m.orders, m.checkouts),
    orders: m.orders,
    conversion_rate: ratio(m.orders, m.sessions),
    aov: ratio(m.revenue, m.orders),
    revenue: m.revenue,
    new_customers: m.new_customers,
    repeat_share: ratio(repeat, m.orders),
    spend: m.spend,
    mer: ratio(m.revenue, m.spend),
    ncac: ratio(m.spend, m.new_customers),
  }
  for (const k of Object.keys(values) as MetricId[]) {
    const v = values[k]
    if (v == null || !Number.isFinite(v)) delete values[k]
  }
  return { week: m.week, values }
}
