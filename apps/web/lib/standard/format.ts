import { formatValue } from "@workspace/metrics/format"
import type { MetricSpec } from "@workspace/metrics"

const durationUnit = { minutes: "minutes", hours: "hours", days: "days", months: "months" } as const
const durationShort = { minutes: "min", hours: "h", days: "d", months: "mo" } as const

/**
 * A spec value for charts and sentences: 62.0%, $1.30M, 1,184, 3.40×, 11.5 months.
 * `short` abbreviates duration units for axes and labels (11.5 mo). Client-safe: never loads the spec set.
 */
export function formatSpecValue(spec: Pick<MetricSpec, "kind" | "duration_unit">, v: number, short = false) {
  if (spec.kind === "duration") {
    const unit = (short ? durationShort : durationUnit)[spec.duration_unit ?? "days"]
    return `${v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US")} ${unit}`
  }
  return formatValue({ kind: spec.kind }, v)
}
