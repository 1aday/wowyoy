import type { MetricSpec } from "@workspace/metrics"

/**
 * What the volume slider needs, computed on the server so the client never loads the spec set.
 * Every noise type's floor scales as 1/√volume, so the floor at volume 1 gives the band at any volume.
 */
export interface BandModel {
  kind: MetricSpec["kind"]
  unit: string
  typical: number
  /** The week-over-week noise floor at a volume of 1, in the metric's unit. */
  abs1: number
  /** Below this weekly volume the answer is "too few to say". */
  min: number
  /** The four reference volumes: the move as the page states it, and the same move another way (relative, or in money). */
  references: { volume: number; move: string; relative: number; alt: string }[]
  altLabel: string
  /** Weekly volume at which a 5% move first clears noise. */
  detect5: number | null
}

/** The band at a volume as NumberFlow parts: ±4.9 pt for rates, ±10% otherwise (same rule as formatMove). */
export function bandParts(m: Pick<BandModel, "kind" | "abs1" | "typical">, volume: number) {
  const absolute = m.abs1 / Math.sqrt(Math.max(volume, 1e-9))
  if (m.kind === "rate") {
    const pt = absolute * 100
    return { value: pt, suffix: " pt", digits: pt < 1 ? 2 : 1, relative: m.typical ? absolute / Math.abs(m.typical) : 0 }
  }
  const pct = (m.typical ? absolute / Math.abs(m.typical) : 0) * 100
  return { value: pct, suffix: "%", digits: pct < 1 ? 2 : pct < 10 ? 1 : 0, relative: pct / 100 }
}

/** Two significant figures, so the slider lands on numbers people say: 820, 3,100, 12,000. */
export function niceVolume(v: number) {
  if (v < 100) return Math.max(1, Math.round(v))
  const p = 10 ** (Math.floor(Math.log10(v)) - 1)
  return Math.round(v / p) * p
}
