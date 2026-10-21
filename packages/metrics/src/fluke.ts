import { mean } from "simple-statistics"
import { MINUS } from "./format"

/**
 * The Fluke Test: is last week's number a real move or ordinary noise?
 *
 * One week's normal spread is σ, estimated from moving ranges (mean |week − week before| ÷ 1.128),
 * which a slow trend barely inflates. Comparing two weeks adds two weeks of noise, so the
 * week-over-week change has spread √2·σ. A change only counts as real beyond 2·√2·σ;
 * judging it against 2·σ would call about one normal week in six "real".
 */

export const SQRT2 = Math.SQRT2
/** d2 for moving ranges of two points: mean |x₁ − x₂| = 1.128σ for normal noise. */
const D2 = 1.128
export const FLUKE_Z = 2
const EDGE_Z = 1.6
/** Weeks of history that define normal. */
export const FLUKE_HISTORY = 26
export const FLUKE_MIN_WEEKS = 6

export type FlukeUnit = "" | "%" | "$"

export type FlukeCall = "real" | "building" | "rebound" | "edge" | "fluke"

export interface FlukeResult {
  call: FlukeCall
  /** The headline, e.g. "Real move." */
  verdict: string
  advice: string
  last: number
  prev: number
  /** Center of normal: mean of the history weeks. */
  center: number
  /** One week's noise. */
  sigma: number
  /** Normal range for a single week: center ± 2σ. */
  range: [number, number]
  /** Normal week-over-week swing: ± 2·√2·σ. */
  swing: number
  change: number
  relativeChange: number
  /** Last week against normal, in σ. */
  zLevel: number
  /** Last week's change against normal swing, in √2·σ. */
  zChange: number
  /** The week before, against normal, in σ. */
  zPrev: number
  /** How often normal noise alone makes a swing at least this big: once every N weeks. */
  oneInWeeks: number
  historyWeeks: number
}

/** Standard normal CDF (Abramowitz and Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number) {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2))
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2)
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

export function flukeTest(values: readonly number[]): FlukeResult | null {
  const n = values.length
  if (n < FLUKE_MIN_WEEKS) return null
  const last = values[n - 1]!
  const prev = values[n - 2]!
  const history = values.slice(Math.max(0, n - 1 - FLUKE_HISTORY), n - 1)
  const ranges: number[] = []
  for (let k = 1; k < history.length; k++) ranges.push(Math.abs(history[k]! - history[k - 1]!))
  const center = mean(history)
  const sigma = mean(ranges) / D2
  if (!(sigma > 0)) return null

  const zLevel = (last - center) / sigma
  const zPrev = (prev - center) / sigma
  const change = last - prev
  const zChange = change / (SQRT2 * sigma)
  const tail = 2 * (1 - normalCdf(Math.abs(zChange)))

  const outside = Math.abs(zLevel) >= FLUKE_Z
  const bigSwing = Math.abs(zChange) >= FLUKE_Z
  let call: FlukeCall
  if (outside && bigSwing) call = "real"
  else if (outside) call = "building"
  else if (bigSwing && Math.abs(zPrev) >= FLUKE_Z) call = "rebound"
  else if (bigSwing || Math.abs(zLevel) >= EDGE_Z) call = "edge"
  else call = "fluke"

  const copy: Record<FlukeCall, [string, string]> = {
    real: ["Real move.", "Find the cause this week. A swing this size rarely happens by chance, and last week is outside its normal range."],
    building: [
      "Real, but not sudden.",
      "Last week is outside its normal range, but the change from the week before is ordinary. Something has been building; look at the last few weeks, not one.",
    ],
    rebound: ["Back to normal.", "The week before was the unusual one. Last week is inside its normal range again."],
    edge: ["On the edge.", "Close to the line. Wait one more week before acting on it."],
    fluke: ["Probably a fluke.", "Weeks like this happen all the time. Nothing to fix."],
  }

  return {
    call,
    verdict: copy[call][0],
    advice: copy[call][1],
    last,
    prev,
    center,
    sigma,
    range: [center - FLUKE_Z * sigma, center + FLUKE_Z * sigma],
    swing: FLUKE_Z * SQRT2 * sigma,
    change,
    relativeChange: prev !== 0 ? last / prev - 1 : 0,
    zLevel,
    zChange,
    zPrev,
    oneInWeeks: tail > 0 ? Math.max(1, Math.round(1 / tail)) : Infinity,
    historyWeeks: history.length,
  }
}

/**
 * Read pasted numbers: "62.1%, 61.4%", "1,184 1,262", "$412k $398k", one per line, whatever.
 * Thousands separators only count in groups of three; k and M scale.
 */
export function parseSeries(text: string): { values: number[]; unit: FlukeUnit } {
  const unit: FlukeUnit = /%/.test(text) ? "%" : /\$/.test(text) ? "$" : ""
  const values: number[] = []
  const re = /([-−]?)(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d*\.?\d+)\s*([kKmM](?![a-zA-Z]))?/g
  for (const m of text.matchAll(re)) {
    let v = Number.parseFloat(m[2]!.replace(/,/g, ""))
    if (!Number.isFinite(v)) continue
    if (m[3]) v *= /k/i.test(m[3]) ? 1e3 : 1e6
    values.push(m[1] ? -v : v)
  }
  return { values, unit }
}

export function formatFluke(v: number, unit: FlukeUnit) {
  const s = v < 0 ? MINUS : ""
  const a = Math.abs(v)
  if (unit === "%") return `${s}${a < 10 ? a.toFixed(2) : a.toFixed(1)}%`
  if (unit === "$") {
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`
    if (a >= 1e4) return `${s}$${(a / 1e3).toFixed(1)}k`
    return `${s}$${a.toLocaleString("en-US", { maximumFractionDigits: a < 100 ? 2 : 0 })}`
  }
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2)}M`
  if (a >= 1e4) return `${s}${(a / 1e3).toFixed(1)}k`
  return `${s}${a.toLocaleString("en-US", { maximumFractionDigits: a < 10 ? 2 : a < 100 ? 1 : 0 })}`
}
