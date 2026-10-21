import { FLUKE_MIN_WEEKS, FLUKE_Z, SQRT2, flukeTest, normalCdf, type FlukeResult } from "./fluke"
import type { NoiseType } from "./spec"

/**
 * The noise model shared by every surface: the Pulse pill, the Fluke Test, the Standard's
 * band, Why pages and Repo Pulse. A week-over-week move is called real only when it clears
 * both of these:
 *
 * 1. The sampling floor: how far two weeks of the same underlying rate drift apart by
 *    chance at this volume. Two noisy weeks are compared, so the floor is 2·√2·σ, not 2·σ.
 *    For a count of N that is ±2√2/√N: 800 a week moves ±10% on chance alone.
 * 2. The process limits: the metric's own week-to-week behaviour over up to 26 weeks
 *    (XmR moving ranges, as in the Fluke Test), which also catches noise sampling can't see.
 *
 * Below the spec's minimum volume the answer is "too few to say", never a number.
 */

export interface NoiseSpec {
  type: NoiseType
  min_denominator: number
  /** Coefficient of variation of one unit, for compound and mean. */
  cv?: number
}

/**
 * One week's sampling σ, in the metric's own unit.
 * `value` is the week's value (a fraction for rates), `volume` its unit count
 * (denominator trials for rates, events for counts and amounts).
 */
export function samplingSigma(type: NoiseType, value: number, volume: number, cv = 1): number | null {
  if (!(volume > 0)) return null
  switch (type) {
    case "binomial": {
      const p = Math.min(Math.max(value, 0), 1)
      return Math.sqrt((p * (1 - p)) / volume)
    }
    case "poisson":
      // A count is its own volume: σ = √N. Scale to the value in case they differ (a share of a count).
      return Math.abs(value) / Math.sqrt(volume)
    case "compound":
      return Math.abs(value) * Math.sqrt((1 + cv * cv) / volume)
    case "mean":
      return (Math.abs(value) * cv) / Math.sqrt(volume)
    case "process":
      return null
  }
}

/** The week-over-week sampling floor: a change smaller than this is chance at this volume. */
export function samplingFloor(type: NoiseType, value: number, volume: number, cv = 1): number | null {
  const s = samplingSigma(type, value, volume, cv)
  return s == null ? null : FLUKE_Z * SQRT2 * s
}

export interface BandRow {
  volume: number
  /** ± the change that is still noise, in the metric's unit (fraction points for rates). */
  absolute: number
  /** The same as a share of the value: ±0.1 = ±10%. */
  relative: number
}

/**
 * The Standard's band table: at each reference volume, how big a week-over-week move
 * is still ordinary noise. Process metrics have no sampling floor and return [].
 */
export function bandAtVolumes(spec: NoiseSpec & { typical: number }, volumes: readonly number[]): BandRow[] {
  if (spec.type === "process") return []
  return volumes.map((volume) => {
    const absolute = samplingFloor(spec.type, spec.typical, volume, spec.cv) ?? 0
    return { volume, absolute, relative: spec.typical !== 0 ? absolute / Math.abs(spec.typical) : 0 }
  })
}

/** The volume at which a given relative move first clears the sampling floor. */
export function volumeToDetect(spec: NoiseSpec & { typical: number }, relativeMove: number): number | null {
  if (spec.type === "process" || !(relativeMove > 0)) return null
  // floor(V) = k/√V for every noise type, so V = (k / move)².
  const atOne = samplingFloor(spec.type, spec.typical, 1, spec.cv)
  if (atOne == null || spec.typical === 0) return null
  const k = atOne / Math.abs(spec.typical)
  return Math.ceil((k / relativeMove) ** 2)
}

export type NoiseCall = "real" | "edge" | "noise" | "too-few"

export interface NoiseVerdict {
  call: NoiseCall
  /** Short headline: "Real move.", "Within noise.", "Too few to say." */
  headline: string
  /** One plain sentence on why. */
  reason: string
  before: number
  after: number
  change: number
  relativeChange: number
  /** The sampling floor at this volume, or null for process metrics or unknown volume. */
  floor: number | null
  clearsFloor: boolean | null
  /** The XmR process read, when there are enough weeks of history. */
  process: FlukeResult | null
  clearsProcess: boolean | null
  /** How often chance alone makes a move this big at this volume: once every N weeks. */
  oneInWeeks: number | null
}

const fmtOne = (n: number) => (n === Infinity ? "rarely" : `about once every ${n} weeks`)

/**
 * The one verdict function. `values` is the weekly series, oldest first, ending at the week judged.
 * `volumes` (same length, optional) is the weekly unit count behind each value.
 */
export function judge(values: readonly number[], spec: NoiseSpec, volumes?: readonly (number | null | undefined)[]): NoiseVerdict | null {
  const n = values.length
  if (n < 2) return null
  const after = values[n - 1]!
  const before = values[n - 2]!
  const change = after - before
  const relativeChange = before !== 0 ? after / before - 1 : 0
  const volA = volumes?.[n - 1] ?? null
  const volB = volumes?.[n - 2] ?? null
  const volume = volA != null && volB != null ? Math.min(volA, volB) : (volA ?? volB)

  const base = { before, after, change, relativeChange }

  if (spec.type !== "process" && volume != null && volume < spec.min_denominator) {
    return {
      ...base,
      call: "too-few",
      headline: "Too few to say.",
      reason: `Under ${spec.min_denominator.toLocaleString("en-US")} a week, chance alone moves this number more than most real changes do.`,
      floor: null,
      clearsFloor: null,
      process: null,
      clearsProcess: null,
      oneInWeeks: null,
    }
  }

  const mid = (after + before) / 2
  const floor = spec.type === "process" || volume == null ? null : samplingFloor(spec.type, mid, volume, spec.cv)
  const clearsFloor = floor == null ? null : Math.abs(change) >= floor
  const process = n >= FLUKE_MIN_WEEKS ? flukeTest(values) : null
  const clearsProcess = process ? process.call === "real" || process.call === "building" : null

  let oneInWeeks: number | null = null
  if (floor != null && floor > 0) {
    const z = Math.abs(change) / (floor / FLUKE_Z)
    const tail = 2 * (1 - normalCdf(z))
    oneInWeeks = tail > 0 ? Math.max(1, Math.round(1 / tail)) : Infinity
  } else if (process) {
    oneInWeeks = process.oneInWeeks
  }

  // Real needs every test we can run to agree; one test alone is enough to call noise.
  const tests = [clearsFloor, clearsProcess].filter((t): t is boolean => t != null)
  let call: NoiseCall
  if (!tests.length) call = "edge"
  else if (tests.every(Boolean)) call = "real"
  else if (process?.call === "edge" || (floor != null && Math.abs(change) >= 0.8 * floor && clearsProcess !== false)) call = "edge"
  else call = "noise"

  const reason =
    call === "real"
      ? floor != null
        ? `A move this size happens by chance ${fmtOne(oneInWeeks ?? Infinity)} at this volume, and it breaks the metric's usual week-to-week range.`
        : "It breaks the metric's usual week-to-week range."
      : call === "edge"
        ? tests.length
          ? "Close to the line. Wait one more week before acting on it."
          : "Not enough history or volume to test it. Treat it as unproven."
        : clearsFloor === false
          ? `At this volume chance alone moves it this much ${fmtOne(oneInWeeks ?? 1)}.`
          : "Weeks like this are inside the metric's usual range."

  return {
    ...base,
    call,
    headline: call === "real" ? "Real move." : call === "edge" ? "On the edge." : "Within noise.",
    reason,
    floor,
    clearsFloor,
    process,
    clearsProcess,
    oneInWeeks,
  }
}

export type TwoWeekKind = "rate" | "count" | "amount"

export interface TwoWeekInput {
  kind: TwoWeekKind
  /** Rates: as fractions (0.041). Counts and amounts: the totals. */
  before: number
  after: number
  /** Rates: trials per week (sessions, checkouts). Amounts: events per week (orders). Counts: unused. */
  volume?: number
  /** Amounts only: coefficient of variation of one event's value. Defaults to 1. */
  cv?: number
}

const twoWeekNoise: Record<TwoWeekKind, NoiseType> = { rate: "binomial", count: "poisson", amount: "compound" }

/**
 * The two-number Fluke Test: last week, this week and the volume, no history.
 * Only the sampling floor can be tested, so the page says so.
 */
export function twoWeekTest(input: TwoWeekInput): NoiseVerdict | null {
  const { kind, before, after } = input
  if (![before, after].every(Number.isFinite)) return null
  if (kind === "rate" && (before < 0 || before > 1 || after < 0 || after > 1)) return null
  const volume = kind === "count" ? Math.max(0, (before + after) / 2) : input.volume
  if (volume == null || !(volume > 0)) return null
  return judge([before, after], { type: twoWeekNoise[kind], min_denominator: kind === "count" ? 10 : 30, cv: input.cv ?? 1 }, [
    kind === "count" ? before : volume,
    kind === "count" ? after : volume,
  ])
}
