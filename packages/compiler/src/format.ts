import { MINUS, formatValue, type BandRow, type MetricSpec } from "@workspace/metrics"

/** A spec value as it reads on a page: 62.0%, $1.30M, 1,184, 3.40×, 4.2 days. */
export function formatAmount(spec: Pick<MetricSpec, "kind" | "duration_unit">, v: number) {
  if (spec.kind === "duration") return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${spec.duration_unit ?? "days"}`
  return formatValue({ kind: spec.kind }, v)
}

/** A noise band row as a move: "±1.9 pt" for rates (absolute), "±10%" otherwise (relative). */
export function formatMove(spec: Pick<MetricSpec, "kind">, r: Pick<BandRow, "absolute" | "relative">) {
  if (spec.kind === "rate") {
    const pt = r.absolute * 100
    return `±${pt < 1 ? pt.toFixed(2) : pt.toFixed(1)} pt`
  }
  const pct = r.relative * 100
  return `±${pct < 1 ? pct.toFixed(2) : pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`
}

export const signed = (n: number, digits = 1) => `${n < 0 ? MINUS : "+"}${Math.abs(n).toFixed(digits)}`
