import type { Dialect, Driver, MetricSpec } from "@workspace/metrics"
import { emitAll } from "./query"
import { paths, whyDirections, type WhyDirection } from "./site"

/** Metrics with fewer drivers than this get no Why pages: a thin page is a prompt to improve the spec. */
export const MIN_DRIVERS_FOR_WHY = 3

export interface WhyPage {
  slug: string
  path: string
  spec: MetricSpec
  direction: WhyDirection
}

export function hasWhy(spec: MetricSpec) {
  return spec.drivers.length >= MIN_DRIVERS_FOR_WHY
}

/** Every Why page the given specs compile to. */
export function whyPages(specs: readonly MetricSpec[]): WhyPage[] {
  return specs.filter(hasWhy).flatMap((spec) =>
    whyDirections.map((direction) => ({ slug: `${spec.id}-${direction}`, path: paths.why(spec.id, direction), spec, direction })),
  )
}

export interface BusinessStep {
  driver: Driver
  /** 1-based position in diagnose order. */
  n: number
  check: string
  yes: string
  /** The Standard page of the metric this driver is, when it is one (and is published). */
  link: { id: string; name: string; path: string } | null
  /** The query to run for this check, by dialect, or null when the check is not a query. */
  queries: Record<Dialect, string | null> | null
  /** How the query is cut: the linked metric's own query, or this metric split by a property. */
  queryKind: "metric" | "breakdown" | null
}

export interface WhySteps {
  /** Step 1, chance: the Fluke Test pre-filled for this metric and direction. */
  chance: { noise: MetricSpec["noise"]; kind: MetricSpec["kind"]; direction: WhyDirection }
  /** Step 2, the world: the feeds whose events can move this metric. */
  world: { feeds: NonNullable<Driver["feed"]>[] }
  /** Step 3, your business: the driver tree walked in diagnose order. */
  business: BusinessStep[]
}

/**
 * The three steps of a Why page, always in this order: chance, the world, your business.
 * `published` is the set of specs this deployment shows, so links never point at a page that isn't there.
 */
export function whySteps(spec: MetricSpec, direction: WhyDirection, published: readonly MetricSpec[]): WhySteps {
  const byId = new Map(published.map((s) => [s.id, s]))
  const drivers = new Map(spec.drivers.map((d) => [d.id, d]))
  const business = spec.diagnose_order.flatMap((id, i): BusinessStep[] => {
    const driver = drivers.get(id)
    if (!driver) return []
    const linked = driver.metric ? byId.get(driver.metric) : undefined
    let queries: BusinessStep["queries"] = null
    let queryKind: BusinessStep["queryKind"] = null
    if (driver.breakdown) {
      const q = emitAll(spec, { breakdown: driver.breakdown })
      if (q.hogql) {
        queries = q
        queryKind = "breakdown"
      }
    }
    if (!queries && linked) {
      queries = emitAll(linked)
      queryKind = "metric"
    }
    return [
      {
        driver,
        n: i + 1,
        check: driver[direction].check,
        yes: driver[direction].yes,
        link: linked ? { id: linked.id, name: linked.name, path: paths.metric(linked.id) } : null,
        queries,
        queryKind,
      },
    ]
  })
  const feeds = [...new Set(spec.drivers.flatMap((d) => (d.feed ? [d.feed] : [])))]
  return { chance: { noise: spec.noise, kind: spec.kind, direction }, world: { feeds }, business }
}
