import { mean, standardDeviation } from "simple-statistics"
import { metricById, type MetricId } from "./catalog"
import type { WeekRow } from "./sample"

export const comparisons = ["wow", "avg4", "avg13", "yoy"] as const
export type Comparison = (typeof comparisons)[number]

export const comparisonLabels: Record<Comparison, { short: string; long: string; flag: string }> = {
  wow: { short: "vs last wk", long: "vs last week", flag: "wow" },
  avg4: { short: "vs 4-wk avg", long: "vs trailing 4-week average", flag: "4wk" },
  avg13: { short: "vs quarter", long: "vs trailing 13-week average", flag: "qtr" },
  yoy: { short: "vs last yr", long: "vs same week last year", flag: "yoy" },
}

/** How many past weeks define "normal" for a comparison. */
const HISTORY = 26
/** Outside ±2σ of its own history = beyond normal noise. */
export const Z_SIGNIFICANT = 2

function baseAt(rows: WeekRow[], id: MetricId, i: number, c: Comparison): number | null {
  const v = (k: number) => rows[k]?.values[id]
  switch (c) {
    case "wow":
      return v(i - 1) ?? null
    case "yoy":
      return v(i - 52) ?? null
    case "avg4":
    case "avg13": {
      const n = c === "avg4" ? 4 : 13
      if (i - n < 0) return null
      let s = 0
      for (let k = i - n; k < i; k++) s += v(k) ?? 0
      return s / n
    }
  }
}

export interface Delta {
  comparison: Comparison
  base: number
  /** Relative change for counts and money, absolute difference for rates. */
  change: number
  /** Always relative, for ranking. */
  relative: number
  /** Standard scores against this comparison's own recent history. */
  z: number
  significant: boolean
  direction: "up" | "down" | "flat"
}

export function delta(rows: WeekRow[], id: MetricId, i: number, c: Comparison): Delta | null {
  const value = rows[i]?.values[id]
  const base = baseAt(rows, id, i, c)
  if (value == null || base == null || base === 0) return null
  const lr = (k: number) => {
    const b = baseAt(rows, id, k, c)
    const x = rows[k]?.values[id]
    return b && x ? Math.log(x / b) : null
  }
  const hist: number[] = []
  for (let k = Math.max(1, i - HISTORY); k < i; k++) {
    const h = lr(k)
    if (h != null) hist.push(h)
  }
  const cur = Math.log(value / base)
  let z = 0
  if (hist.length >= 8) {
    const sd = standardDeviation(hist)
    z = sd > 0 ? (cur - mean(hist)) / sd : 0
  }
  const kind = metricById[id].kind
  const relative = value / base - 1
  const change = kind === "rate" ? value - base : relative
  const flat = Math.abs(relative) < 0.0005
  return {
    comparison: c,
    base,
    change,
    relative,
    z,
    significant: Math.abs(z) >= Z_SIGNIFICANT && !flat,
    direction: flat ? "flat" : relative > 0 ? "up" : "down",
  }
}

/** Trailing 13-week mean ±2σ for each week: the grey "normal" band on charts. */
export function normalBand(rows: WeekRow[], id: MetricId, i: number, window = 13) {
  if (i - window < 0) return null
  const xs: number[] = []
  for (let k = i - window; k < i; k++) xs.push(rows[k]!.values[id])
  const m = mean(xs)
  const sd = standardDeviation(xs)
  return { mean: m, lo: m - 2 * sd, hi: m + 2 * sd }
}

export interface PulseRow {
  id: MetricId
  value: number
  deltas: Record<Comparison, Delta | null>
}

export function pulse(rows: WeekRow[], i: number, ids: readonly MetricId[]): PulseRow[] {
  return ids.map((id) => ({
    id,
    value: rows[i]!.values[id],
    deltas: Object.fromEntries(comparisons.map((c) => [c, delta(rows, id, i, c)])) as Record<
      Comparison,
      Delta | null
    >,
  }))
}
