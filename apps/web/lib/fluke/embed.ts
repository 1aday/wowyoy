import { exampleSeries } from "@workspace/metrics/example"
import { FLUKE_HISTORY, flukeTest } from "@workspace/metrics/fluke"
import { samplingFloor, twoWeekKindFor } from "@workspace/metrics/noise"
import type { MetricSpec } from "@workspace/metrics/spec"
import type { WhyDirection } from "@workspace/compiler/site"
import { formatTwoWeekValue, type TwoWeekValues } from "./two-week"

/** The fields of a spec the embed reads. */
export type EmbedSpec = Pick<MetricSpec, "id" | "name" | "kind" | "noise" | "example" | "polarity">

export type EmbedPrefill =
  | { mode: "two-weeks"; values: TwoWeekValues; volumeLabel: string; volumeUnit: string }
  /** Process metrics: the example's weekly history, in display units (rates in percent), oldest first. */
  | { mode: "history"; history: number[]; before: number; after: number }

/** Round to a step about a tenth of the floor, so the typed numbers are short but the call doesn't move. */
function nice(x: number, scale: number) {
  if (!(scale > 0)) return x
  const step = 10 ** Math.floor(Math.log10(scale / 10))
  return Number((Math.round(x / step) * step).toFixed(Math.max(0, -Math.floor(Math.log10(step)))))
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A metric name inside a sentence: "checkout conversion", but "MRR" and "AOV" stay as they are. */
export const inSentence = (name: string) => (/^[A-Z][A-Z0-9]/.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1))

/** A process metric's value in display units (rates in percent): 4.10%, $244k, 3.40×, 1,184. */
export function formatSpecValue(kind: MetricSpec["kind"], v: number) {
  switch (kind) {
    case "rate":
      return formatTwoWeekValue("rate", v)
    case "currency":
      return formatTwoWeekValue("amount", v)
    case "ratio":
      return `${v.toFixed(2)}×`
    case "duration":
      return v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US")
    default:
      return formatTwoWeekValue("count", v)
  }
}

export const specUnit = (kind: MetricSpec["kind"]) => (kind === "rate" ? "%" : kind === "currency" ? "$" : "")

/**
 * Pre-fill the embed from the spec's example: its typical level and weekly volume.
 * On a Why page the move goes in the page's direction and is big enough to be real (1.3× the floor);
 * on a Standard page it is a small move in the unwelcome direction (half the floor), the kind that is noise.
 * Process metrics have no floor: they get the example's own history and a move against its usual swing.
 */
export function embedPrefill(spec: EmbedSpec, direction?: WhyDirection, end?: string): EmbedPrefill {
  const kind = twoWeekKindFor(spec.noise.type)
  const sign = direction === "spiked" ? 1 : direction === "dropped" ? -1 : spec.polarity === "up-is-good" ? -1 : 1
  if (kind) {
    const f = kind === "rate" ? 100 : 1
    const level = spec.example.level
    const volume = Math.max(spec.noise.min_denominator, Math.round(kind === "count" ? level : spec.example.volume))
    const floor = (samplingFloor(spec.noise.type, level, kind === "count" ? level : volume, spec.noise.cv) ?? 0) * f
    const before = nice(level * f, floor)
    let after = nice(before + sign * (direction ? 1.3 : 0.5) * floor, floor)
    if (kind === "rate") after = Math.min(100, Math.max(0, after))
    if (kind !== "rate") after = Math.max(0, after)
    const values: TwoWeekValues = {
      kind,
      before,
      after,
      ...(kind === "count" ? {} : { volume: nice(volume, volume / 10) }),
      ...(spec.noise.cv && (kind === "amount" || kind === "average") ? { cv: spec.noise.cv } : {}),
    }
    const unit = spec.noise.volume_unit
    return { mode: "two-weeks", values, volumeLabel: sentence(unit), volumeUnit: unit }
  }

  const f = spec.kind === "rate" ? 100 : 1
  const series = exampleSeries(spec, { weeks: FLUKE_HISTORY + 2, end }).map((p) => p.value * f)
  const history = series.slice(0, -2)
  const res = flukeTest(series.slice(0, -1))
  const before = series.at(-2)!
  const swing = res?.swing ?? Math.abs(before) * 0.05
  const step = Math.abs(before) / 1000 || 1
  let after = series.at(-1)!
  if (direction) after = before + sign * 1.3 * swing
  return {
    mode: "history",
    history: history.map((x) => nice(x, step * 10)),
    before: nice(before, step * 10),
    after: nice(after, step * 10),
  }
}
