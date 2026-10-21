import {
  exampleBusinesses,
  exampleSeries,
  flukeTest,
  judge,
  type Measure,
  type MetricSpec,
  type NoiseType,
  type NoiseVerdict,
  type SpecFilter,
} from "@workspace/metrics"
import type { WhyDirection } from "@workspace/compiler"

/** How each page reads a spec's fields: labels, sentences and the example chart's data. Pure, server or client. */

export const kindLabel = (s: Pick<MetricSpec, "kind" | "duration_unit">) =>
  s.kind === "duration" ? `Duration, ${s.duration_unit ?? "days"}` : s.kind[0]!.toUpperCase() + s.kind.slice(1)

export const noiseLabel: Record<NoiseType, string> = {
  binomial: "Binomial",
  poisson: "Poisson",
  compound: "Compound",
  mean: "Mean",
  process: "Process",
}

/** One sentence on why the number wobbles, per noise type. */
export const noiseSentence: Record<NoiseType, string> = {
  binomial: "A rate of trials. Chance alone moves it by √(p(1 − p) / n) a week, so the fewer trials, the wider the band.",
  poisson: "A count of independent events. Chance alone moves it by about √N a week.",
  compound: "A sum of amounts. Chance moves it by both how many events there were and how big each one was.",
  mean: "An average amount. Chance moves it by how much single amounts vary, divided by √N.",
  process: "A stock, a ratio of sums or a chosen number. It has no single sampling unit, so no volume makes it noisy.",
}

const aggregateWords: Record<Measure["aggregate"], string> = {
  count: "count of",
  unique_users: "unique people with",
  unique_sessions: "unique sessions with",
  sum: "sum of",
  first_time_users: "people with their first",
  returning_users: "returning people with",
}

/** "unique sessions with" / "sum of total on" */
export function aggregatePhrase(m: Measure) {
  return m.aggregate === "sum" ? `sum of ${m.property} on` : aggregateWords[m.aggregate]
}

const opWords: Record<SpecFilter["op"], string> = {
  eq: "=",
  neq: "≠",
  in: "in",
  not_in: "not in",
  is_set: "is set",
  is_not_set: "is not set",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
}

export function filterText(f: SpecFilter) {
  const v = f.value
  const val = Array.isArray(v) ? `(${v.join(", ")})` : v == null ? "" : String(v)
  return `${f.property} ${opWords[f.op]}${val ? ` ${val}` : ""}`
}

/** "Checkout conversion" → "checkout conversion"; acronyms (MRR, AOV, DAU) keep their case. */
export function lowerName(name: string) {
  const first = name.split(/\s+/)[0] ?? ""
  if (first.length > 1 && first === first.toUpperCase()) return name
  return name[0]!.toLowerCase() + name.slice(1)
}

/** The question a founder types: "Why did checkout conversion drop?" */
export function whyQuestion(s: Pick<MetricSpec, "name">, direction: WhyDirection) {
  return `Why did ${lowerName(s.name)} ${direction === "dropped" ? "drop" : "spike"}?`
}

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"]
export const numberWord = (n: number) => WORDS[n] ?? String(n)

export const businessName = (s: Pick<MetricSpec, "example">) => exampleBusinesses[s.example.business]

export interface TrendPoint {
  week: string
  value: number
  lastYear: number | null
  /** Trailing 13 weeks' mean ± 2σ, excluding the week itself. */
  band: [number, number] | null
  volume: number
}

export interface TrendView {
  points: TrendPoint[]
  verdict: NoiseVerdict | null
  /** Whether the latest week sits outside its band. */
  outside: "above" | "below" | null
}

function band(xs: readonly number[]): [number, number] | null {
  if (xs.length < 2) return null
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
  return [m - 2 * sd, m + 2 * sd]
}

/** The example chart's data: `weeks` weeks of the spec's example series with last year and the normal band. */
export function trendView(spec: Pick<MetricSpec, "id" | "kind" | "noise" | "example">, weeks = 26, end?: string): TrendView {
  const window = 13
  const all = exampleSeries(spec, { weeks: weeks + 52, end })
  const values = all.map((p) => p.value)
  const points: TrendPoint[] = []
  for (let i = all.length - weeks; i < all.length; i++) {
    const p = all[i]!
    points.push({
      week: p.week,
      value: p.value,
      lastYear: all[i - 52]?.value ?? null,
      band: band(values.slice(Math.max(0, i - window), i)),
      volume: p.volume,
    })
  }
  const recent = all.slice(-27)
  const verdict = judge(
    recent.map((p) => p.value),
    spec.noise,
    recent.map((p) => p.volume),
  )
  const last = points.at(-1)
  const outside = last?.band ? (last.value > last.band[1] ? "above" : last.value < last.band[0] ? "below" : null) : null
  return { points, verdict, outside }
}

/** For metrics with no sampling floor: the normal week-to-week move in the example data, as a share of the level. */
export function processSwing(spec: Pick<MetricSpec, "id" | "kind" | "noise" | "example">, end?: string) {
  const res = flukeTest(exampleSeries(spec, { weeks: 27, end }).map((p) => p.value))
  if (!res || res.center === 0) return null
  return { swing: res.swing, relative: res.swing / Math.abs(res.center), weeks: res.historyWeeks }
}
