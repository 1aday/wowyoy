import { WAREHOUSE_SCHEMA, hasWhy, paths, type WhyDirection } from "@workspace/compiler"
import { aliasRedirects, specById, type Dialect, type MetricSpec } from "@workspace/metrics"
import type { TreeDriver } from "@/components/standard/driver-tree"

/** Shared lookups for the Standard and Why pages. Server only. */

/** A spec by id, or the canonical id an alias (or a differently cased id) points to. */
export function resolveMetric(slug: string): { spec: MetricSpec } | { redirect: string } | null {
  const spec = specById(slug)
  if (spec) return { spec }
  const lower = slug.toLowerCase()
  const to = specById(lower)?.id ?? aliasRedirects()[lower]
  return to ? { redirect: paths.metric(to) } : null
}

const schema = WAREHOUSE_SCHEMA.replace(/: one row per event.*$/, "")

/**
 * What each dialect's query assumes, shown under the code. Compiled queries say it in their own
 * header comment, so only hand-written ones need the note.
 */
export function queryNotes(handWritten: boolean): Partial<Record<Dialect, string>> {
  if (!handWritten) return {}
  const warehouse = `Hand-written for this metric. Assumes ${schema}, times in UTC.`
  return {
    hogql: "Hand-written for this metric. Runs as is in a PostHog SQL insight.",
    postgres: warehouse,
    bigquery: warehouse,
    snowflake: `${warehouse} WEEK_START = 1.`,
  }
}

/** The driver tree's nodes in diagnose order. Links only to Standard pages this deployment publishes. */
export function treeDrivers(spec: MetricSpec, published: readonly MetricSpec[], direction: WhyDirection = "dropped"): TreeDriver[] {
  const byId = new Map(published.map((s) => [s.id, s]))
  const drivers = new Map(spec.drivers.map((d) => [d.id, d]))
  return spec.diagnose_order.flatMap((id, i) => {
    const d = drivers.get(id)
    if (!d) return []
    const linked = d.metric ? byId.get(d.metric) : undefined
    const tag = d.metric ? d.metric : d.breakdown ? `by ${d.breakdown}` : d.feed ? `world · ${d.feed}` : null
    return [{ n: i + 1, id: d.id, label: d.label, href: linked ? paths.metric(linked.id) : null, tag, check: d[direction].check, yes: d[direction].yes }]
  })
}

/** Why pages for a spec, when it has enough drivers and is published here. */
export function whyLinks(spec: MetricSpec, published: readonly MetricSpec[]) {
  if (!hasWhy(spec) || !published.some((s) => s.id === spec.id)) return null
  return { dropped: paths.why(spec.id, "dropped"), spiked: paths.why(spec.id, "spiked") }
}
