import type { MetricDef } from "./catalog"

/** True minus sign, never a hyphen. */
export const MINUS = "−"
export const UP = "▲"
export const DOWN = "▼"

const sign = (n: number) => (n < 0 ? MINUS : "+")

export function formatCompact(n: number, digits = 1) {
  const a = Math.abs(n)
  const s = n < 0 ? MINUS : ""
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(digits)}B`
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`
  return `${s}${Math.round(a).toLocaleString("en-US")}`
}

/** Format a metric value the way it is read in a table. */
export function formatValue(def: Pick<MetricDef, "kind">, v: number, opts: { compact?: boolean } = {}) {
  const compact = opts.compact ?? true
  switch (def.kind) {
    case "rate":
      return `${(v * 100).toFixed(v < 0.1 ? 2 : 1)}%`
    case "ratio":
      return `${v.toFixed(2)}×`
    case "currency": {
      if (Math.abs(v) < 1000) return `${v < 0 ? MINUS : ""}$${Math.abs(v).toFixed(2)}`
      return compact ? `${v < 0 ? MINUS : ""}$${formatCompact(Math.abs(v))}` : `$${Math.round(v).toLocaleString("en-US")}`
    }
    default:
      return compact ? formatCompact(v) : Math.round(v).toLocaleString("en-US")
  }
}

/** Parts of a value for NumberFlow: the number and its prefix/suffix. */
export function valueParts(def: Pick<MetricDef, "kind">, v: number) {
  switch (def.kind) {
    case "rate":
      return { value: v * 100, prefix: "", suffix: "%", fraction: v < 0.1 ? 2 : 1 }
    case "ratio":
      return { value: v, prefix: "", suffix: "×", fraction: 2 }
    case "currency": {
      if (Math.abs(v) < 1000) return { value: v, prefix: "$", suffix: "", fraction: 2 }
      if (Math.abs(v) >= 1e6) return { value: v / 1e6, prefix: "$", suffix: "M", fraction: 2 }
      return { value: v / 1e3, prefix: "$", suffix: "k", fraction: 1 }
    }
    default: {
      if (Math.abs(v) >= 1e5) return { value: v / 1e3, prefix: "", suffix: "k", fraction: 0 }
      if (Math.abs(v) >= 1e4) return { value: v / 1e3, prefix: "", suffix: "k", fraction: 1 }
      return { value: v, prefix: "", suffix: "", fraction: 0 }
    }
  }
}

/** A change: percent for counts and money, percentage points for rates. */
export function formatChange(kind: MetricDef["kind"], change: number) {
  if (kind === "rate") return `${sign(change)}${Math.abs(change * 100).toFixed(1)} pt`
  const pct = change * 100
  const digits = Math.abs(pct) < 10 ? 1 : 0
  return `${sign(change)}${Math.abs(pct).toFixed(digits)}%`
}

export function formatWeek(week: string) {
  const d = new Date(`${week}T00:00:00Z`)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

export function formatWeekRange(week: string) {
  const d = new Date(`${week}T00:00:00Z`)
  const e = new Date(d.getTime() + 6 * 864e5)
  const f = (x: Date, y = false) =>
    x.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(y ? { year: "numeric" } : {}), timeZone: "UTC" })
  return `${f(d)} – ${f(e, true)}`
}
