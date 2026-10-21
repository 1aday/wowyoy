import { isoWeekOf, judge, latestClosedWeek, shiftWeek, type IsoWeek, type NoiseSpec, type NoiseVerdict } from "@workspace/metrics"
import type { MeasureRead, MeasureSeries } from "./types"

/** Weeks of history judged: the same 26 the Fluke Test reads. */
export const WINDOW_WEEKS = 26
/** Weeks behind the grey normal band. */
export const BAND_WEEKS = 13

/**
 * Stars, forks, issues and PRs are counts, so their noise is Poisson: a week of N drifts by about √N
 * on chance alone. Under 10 a week, chance moves the count more than most real changes do.
 */
export const REPO_NOISE: NoiseSpec = { type: "poisson", min_denominator: 10 }

const DAY = 864e5
const WEEK = 7 * DAY

export const mondayMs = (w: IsoWeek) => Date.parse(`${w.monday}T00:00:00Z`)

export interface PulseWindow {
  /** Oldest first: `closed` closed weeks, then the open ones up to now. */
  weeks: IsoWeek[]
  closed: number
  /** Monday 00:00 UTC of the first week, ms. */
  start: number
  now: number
}

/** The 26 latest closed weeks, then every week still open (one, or two early on a Monday before the close). */
export function pulseWindow(now: Date, size = WINDOW_WEEKS): PulseWindow {
  const last = latestClosedWeek(now)
  const first = shiftWeek(last, -(size - 1))
  const weeks: IsoWeek[] = []
  for (let k = 0; k < size; k++) weeks.push(shiftWeek(first, k))
  const current = isoWeekOf(now)
  for (let w = shiftWeek(last, 1); w.monday <= current.monday; w = shiftWeek(w, 1)) weeks.push(w)
  return { weeks, closed: size, start: mondayMs(first), now: +now }
}

/**
 * Count events into the window's weeks. When not every event since the window start was read,
 * `coveredFrom` (ms) is the oldest one that was: weeks that start before it are null, not low.
 */
export function bucketByWeek(timestamps: readonly (string | number)[], win: PulseWindow, coveredFrom: number | null = null): (number | null)[] {
  const counts = win.weeks.map(() => 0)
  for (const t of timestamps) {
    const ms = typeof t === "number" ? t : Date.parse(t)
    if (!(ms >= win.start)) continue
    const i = Math.floor((ms - win.start) / WEEK)
    if (i < counts.length) counts[i]!++
  }
  return counts.map((c, i) => (coveredFrom != null && mondayMs(win.weeks[i]!) < coveredFrom ? null : c))
}

/** One week of GitHub's commit_activity: `week` is the Sunday it starts on (unix seconds), `days` Sunday to Saturday. */
export interface CommitWeek {
  week: number
  days: number[]
  total: number
}

/**
 * Re-file GitHub's Sunday-to-Saturday commit weeks into ISO weeks, day by day. GitHub stamps each
 * week at local midnight, so a day is filed under the UTC date nearest its stamp.
 */
export function commitsByWeek(activity: readonly CommitWeek[], win: PulseWindow): (number | null)[] {
  const counts: (number | null)[] = win.weeks.map(() => 0)
  if (!activity.length) return counts
  let firstDay = Infinity
  for (const a of activity) {
    a.days.forEach((n, d) => {
      const day = Math.round((a.week * 1000 + d * DAY) / DAY) * DAY
      firstDay = Math.min(firstDay, day)
      if (day < win.start) return
      const i = Math.floor((day - win.start) / WEEK)
      if (i < counts.length) counts[i] = (counts[i] ?? 0) + n
    })
  }
  return counts.map((c, i) => (mondayMs(win.weeks[i]!) < firstDay ? null : c))
}

/**
 * The verdict for each closed week, on the shared noise model: the week against the one before,
 * at its own volume, and against the repo's run of weeks before it (up to 26).
 */
export function weekCalls(counts: readonly (number | null)[], closed: number): (NoiseVerdict | null)[] {
  return counts.map((c, i) => {
    if (i >= closed || c == null) return null
    let s = i
    while (s > 0 && counts[s - 1] != null) s--
    const values = counts.slice(s, i + 1) as number[]
    if (values.length < 2) return null
    return judge(values, REPO_NOISE, values)
  })
}

/** The grey normal band: the trailing 13 closed weeks' mean ±2σ, floored at zero. */
export function weekBands(counts: readonly (number | null)[], closed: number, size = BAND_WEEKS): ([number, number] | null)[] {
  return counts.map((_, i) => {
    const from = i - size
    const to = Math.min(i, closed)
    if (from < 0 || to - from < size) return null
    const xs = counts.slice(from, to)
    if (xs.some((x) => x == null)) return null
    const ys = xs as number[]
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length
    const sd = Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length)
    return [Math.max(0, mean - 2 * sd), mean + 2 * sd]
  })
}

export function readMeasure(series: MeasureSeries, closed: number): MeasureRead {
  return { ...series, calls: weekCalls(series.counts, closed), bands: weekBands(series.counts, closed) }
}
