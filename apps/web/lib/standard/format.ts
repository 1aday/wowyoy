import { formatValue } from "@workspace/metrics/format"
import type { MetricSpec } from "@workspace/metrics"

const durationUnit = { minutes: "min", hours: "h", days: "days", months: "months" } as const

/** A spec value for charts and sentences: 62.0%, $1.30M, 1,184, 3.40×, 26 h. Client-safe (never loads the spec set). */
export function formatSpecValue(spec: Pick<MetricSpec, "kind" | "duration_unit">, v: number) {
  if (spec.kind === "duration") return `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US")} ${durationUnit[spec.duration_unit ?? "days"]}`
  return formatValue({ kind: spec.kind }, v)
}
