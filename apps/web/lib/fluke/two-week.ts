import { FLUKE_Z, normalCdf } from "@workspace/metrics/fluke"
import { DOWN, MINUS, UP } from "@workspace/metrics/format"
import { twoWeekKinds, twoWeekTest, type NoiseCall, type TwoWeekKind } from "@workspace/metrics/noise"
import { parseNumber, segment } from "./number"

/**
 * The two-number Fluke Test as every surface shows it: the /fluke form, its share paths, the API,
 * the OG card and the embed. Values here are in display units: rates in percent (4.1 = 4.1%).
 */

export interface TwoWeekValues {
  kind: TwoWeekKind
  before: number
  after: number
  /** Rates: trials a week. Amounts and averages: orders a week. Counts: not used. */
  volume?: number
  /** Amounts and averages: how much one order's value varies (sd ÷ mean). Defaults to 1. */
  cv?: number
}

export interface KindInfo {
  label: string
  /** "%" is written after the number, "$" before it. */
  unit: "%" | "$" | ""
  volume: { label: string; unit: string; hint: string } | null
}

export const kindInfo: Record<TwoWeekKind, KindInfo> = {
  rate: {
    label: "Rate",
    unit: "%",
    volume: { label: "Trials a week", unit: "a week", hint: "What the rate is out of: sessions, visitors or checkouts." },
  },
  count: { label: "Count", unit: "", volume: null },
  amount: {
    label: "Amount",
    unit: "$",
    volume: { label: "Orders a week", unit: "orders a week", hint: "How many orders add up to the total." },
  },
  average: {
    label: "Average",
    unit: "$",
    volume: { label: "Orders a week", unit: "orders a week", hint: "How many orders the average is taken over." },
  },
}

export { twoWeekKinds }

export const kindHelp: Record<TwoWeekKind, string> = {
  rate: "A share of something: conversion, click-through, churn.",
  count: "Things that happen: orders, signups, sessions.",
  amount: "Money added up over orders: revenue, refunds.",
  average: "Money per order: AOV, revenue per customer.",
}

/** One worked example per kind; picking a kind loads it. */
export const twoWeekPresets: Record<TwoWeekKind, TwoWeekValues> = {
  rate: { kind: "rate", volume: 800, before: 4.1, after: 3.6 },
  count: { kind: "count", before: 1184, after: 1402 },
  amount: { kind: "amount", volume: 13000, before: 412000, after: 447000 },
  average: { kind: "average", volume: 1300, before: 31.7, after: 33.2 },
}

export const TWO_WEEK_LIMITS = { volume: 1e9, value: 1e12, cv: [0.05, 20] as const }

/** What is wrong with these inputs, in a sentence, or null when they can be tested. */
export function validateTwoWeek(v: TwoWeekValues): string | null {
  if (!twoWeekKinds.includes(v.kind)) return "Kind is one of rate, count, amount or average."
  if (![v.before, v.after].every(Number.isFinite)) return "Enter both weeks as numbers."
  if (v.before < 0 || v.after < 0) return "Weekly numbers can't be negative."
  if (v.kind === "rate" && (v.before > 100 || v.after > 100)) return "A rate is between 0% and 100%."
  if (Math.max(v.before, v.after) > TWO_WEEK_LIMITS.value) return "That number is too large to test."
  const vol = kindInfo[v.kind].volume
  if (vol) {
    if (v.volume == null || !Number.isFinite(v.volume))
      return `volume is required: ${vol.label.toLowerCase()}, ${vol.hint.charAt(0).toLowerCase()}${vol.hint.slice(1)}`
    if (!Number.isInteger(v.volume) || v.volume < 1 || v.volume > TWO_WEEK_LIMITS.volume)
      return "Volume is a whole number a week, 1 or more."
  }
  if (v.cv != null && !(v.cv >= TWO_WEEK_LIMITS.cv[0] && v.cv <= TWO_WEEK_LIMITS.cv[1])) return `cv is between ${TWO_WEEK_LIMITS.cv[0]} and ${TWO_WEEK_LIMITS.cv[1]}.`
  return null
}

const trim = (s: string) => (s.includes(".") ? s.replace(/\.?0+$/, "") : s)

function money(a: number) {
  if (a >= 1e6) return `$${trim((a / 1e6).toFixed(2))}M`
  if (a >= 1e4) return `$${trim((a / 1e3).toFixed(1))}k`
  if (a >= 100) return `$${Math.round(a).toLocaleString("en-US")}`
  return `$${a.toFixed(2)}`
}

/** A value as it reads: 4.10%, 1,184, $412k, $31.70. */
export function formatTwoWeekValue(kind: TwoWeekKind, v: number) {
  const a = Math.abs(v)
  const s = v < 0 ? MINUS : ""
  if (kind === "rate") return `${s}${a < 10 ? a.toFixed(2) : a.toFixed(1)}%`
  if (kind === "count") return `${s}${a.toLocaleString("en-US", { maximumFractionDigits: a < 100 ? 1 : 0 })}`
  return `${s}${money(a)}`
}

const points = (x: number) => {
  const a = Math.abs(x)
  return `${a < 1 ? a.toFixed(2) : a.toFixed(1)} pt`
}
const percent = (x: number) => {
  const a = Math.abs(x) * 100
  return `${a < 1 ? a.toFixed(2) : a < 10 ? a.toFixed(1) : a.toFixed(0)}%`
}
const whole = (n: number) => Math.round(n).toLocaleString("en-US")

/** How often chance alone clears the floor: a two-sided 2σ move, about once in 22 weeks. */
export const FLOOR_ONE_IN = Math.round(1 / (2 * (1 - normalCdf(FLUKE_Z))))

/** "most weeks", "about every other week", "about once in 3,400 weeks", "almost never". */
export function chanceFrequency(oneInWeeks: number) {
  if (oneInWeeks < 1.5) return "most weeks"
  if (oneInWeeks < 2.5) return "about every other week"
  if (!Number.isFinite(oneInWeeks) || oneInWeeks >= 1e5) return "almost never"
  // Two significant figures: the tail of a normal curve isn't known to the week.
  return `about once in ${whole(oneInWeeks >= 100 ? Number(oneInWeeks.toPrecision(2)) : oneInWeeks)} weeks`
}

/** Plain text with the numbers marked, so pages can set them in mono and colour the change. */
export type Part = string | { num: string; tone?: "up" | "down" }

export const plain = (parts: Part[]) => parts.map((p) => (typeof p === "string" ? p : p.num)).join("")

export interface Move {
  /** Display units: percentage points for rates, the metric's unit otherwise. */
  absolute: number
  relative: number
  /** "0.50 pt" for rates, "18%" otherwise; no sign. */
  label: string
}

export interface TwoWeekReport {
  values: TwoWeekValues
  call: NoiseCall
  headline: string
  significant: boolean
  direction: "up" | "down" | "flat"
  change: Move
  /** ± the move chance alone makes about once in 22 weeks, or null when the volume is too small. */
  floor: Move | null
  oneInWeeks: number | null
  /** Two sentences: what chance does at this volume, and what this move is. */
  explain: Part[][]
  /** Shown with every two-number result. */
  caveat: string
  path: string
}

export const TWO_WEEK_CAVEAT =
  "With two numbers only the sampling floor can be tested: the noise of counting a limited number of visitors or orders. A metric's own week-to-week swing is often wider, so paste its history for the full test."

export interface ReportOptions {
  /** What one unit of volume is, from a spec: "checkouts started a week". */
  volumeUnit?: string
}

export function runTwoWeek(values: TwoWeekValues, opts: ReportOptions = {}): TwoWeekReport | { error: string } {
  const error = validateTwoWeek(values)
  if (error) return { error }
  const { kind, before, after } = values
  const f = kind === "rate" ? 100 : 1
  const v = twoWeekTest({ kind, before: before / f, after: after / f, volume: values.volume, cv: values.cv })
  if (!v) return { error: "These numbers can't be tested." }

  const round = (x: number) => Number(x.toPrecision(10))
  const change = round(after - before)
  const mid = (before + after) / 2
  const relative = round(before !== 0 ? after / before - 1 : 0)
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat"
  const moveLabel = (abs: number, rel: number) =>
    kind === "rate" ? points(abs) : before !== 0 || kind !== "count" ? percent(rel) : whole(abs)
  const floorAbs = v.floor == null ? null : v.floor * f
  const floor = floorAbs == null ? null : { absolute: round(floorAbs), relative: round(mid !== 0 ? floorAbs / mid : 0), label: "" }
  if (floor) floor.label = `±${kind === "rate" ? points(floor.absolute) : percent(floor.relative)}`
  const glyph = direction === "up" ? UP : direction === "down" ? DOWN : ""
  const changeMove: Move = { absolute: change, relative, label: moveLabel(change, relative) }

  const volumeText: Part[] =
    kind === "count"
      ? ["about ", { num: whole(mid) }, " a week"]
      : [{ num: whole(values.volume!) }, ` ${opts.volumeUnit ?? kindInfo[kind].volume!.unit}`]
  const subject: Part[] =
    kind === "rate"
      ? ["a rate around ", { num: formatTwoWeekValue(kind, mid) }]
      : kind === "count"
        ? ["the count"]
        : kind === "amount"
          ? ["a weekly total around ", { num: formatTwoWeekValue(kind, mid) }]
          : ["an average around ", { num: formatTwoWeekValue(kind, mid) }]

  const explain: Part[][] = []
  if (floor) {
    explain.push([
      "At ",
      ...volumeText,
      ", chance alone moves ",
      ...subject,
      " by ",
      { num: floor.label },
      ...(kind === "count" ? [" (", { num: `±${whole(floor.absolute)}` }, ")"] : []),
      " or more about once in ",
      { num: String(FLOOR_ONE_IN) },
      " weeks.",
    ])
    explain.push([
      "This move is ",
      direction === "flat" ? { num: "zero" } : { num: `${glyph}${changeMove.label}`, tone: direction },
      direction === "flat" ? "." : `: chance makes one this big ${chanceFrequency(v.oneInWeeks ?? 1)}.`,
    ])
  } else {
    explain.push([v.reason])
  }

  return {
    values,
    call: v.call,
    headline: v.headline,
    significant: v.call === "real",
    direction,
    change: changeMove,
    floor,
    oneInWeeks: v.oneInWeeks,
    explain,
    caveat: TWO_WEEK_CAVEAT,
    path: twoWeekPath(values),
  }
}

/** The share path: /fluke/rate/800/4.1/3.6, /fluke/count/1184/1402, /fluke/amount/13000/412000/447000. */
export function twoWeekPath(v: TwoWeekValues) {
  const nums = v.kind === "count" ? [v.before, v.after] : [v.volume ?? 0, v.before, v.after]
  const cv = (v.kind === "amount" || v.kind === "average") && v.cv != null && v.cv !== 1 ? `?cv=${segment(v.cv)}` : ""
  return `/fluke/${v.kind}/${nums.map(segment).join("/")}${cv}`
}

const NUM = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/
const INT = /^[1-9]\d{0,8}$/

/** Strictly parse a share path's segments (after /fluke). Anything off returns null, and the page 404s. */
export function parseTwoWeekPath(segments: readonly string[], cv?: string | null): TwoWeekValues | null {
  const [kind, ...rest] = segments
  if (!kind || !(twoWeekKinds as readonly string[]).includes(kind)) return null
  const k = kind as TwoWeekKind
  let values: TwoWeekValues
  if (k === "count") {
    if (rest.length !== 2 || !rest.every((s) => NUM.test(s))) return null
    values = { kind: k, before: Number(rest[0]), after: Number(rest[1]) }
  } else {
    if (rest.length !== 3 || !INT.test(rest[0]!) || !NUM.test(rest[1]!) || !NUM.test(rest[2]!)) return null
    values = { kind: k, volume: Number(rest[0]), before: Number(rest[1]), after: Number(rest[2]) }
    if (cv != null && (k === "amount" || k === "average")) {
      if (!NUM.test(cv)) return null
      values.cv = Number(cv)
    }
  }
  return validateTwoWeek(values) ? null : values
}

/** The form's text fields, as typed. */
export interface TwoWeekText {
  kind: TwoWeekKind
  before: string
  after: string
  volume: string
  cv?: number
}

const typed = (kind: TwoWeekKind, v: number) =>
  kind === "rate"
    ? segment(v)
    : kind === "average" || (kind === "amount" && v < 100)
      ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 2 : 0 })

export function toText(v: TwoWeekValues): TwoWeekText {
  return {
    kind: v.kind,
    before: typed(v.kind, v.before),
    after: typed(v.kind, v.after),
    volume: v.volume ? v.volume.toLocaleString("en-US") : "",
    cv: v.cv,
  }
}

/** Parse the form. Field errors name the field; `values` is set when everything reads. */
export function fromText(t: TwoWeekText): { values: TwoWeekValues | null; errors: Partial<Record<"before" | "after" | "volume", string>> } {
  const errors: Partial<Record<"before" | "after" | "volume", string>> = {}
  const before = parseNumber(t.before)
  const after = parseNumber(t.after)
  const needsVolume = !!kindInfo[t.kind].volume
  const volume = needsVolume ? parseNumber(t.volume) : null
  if (before == null) errors.before = t.before.trim() ? "Not a number." : "Required."
  if (after == null) errors.after = t.after.trim() ? "Not a number." : "Required."
  if (needsVolume && volume == null) errors.volume = t.volume.trim() ? "Not a number." : "Required."
  if (before == null || after == null || (needsVolume && volume == null)) return { values: null, errors }
  const values: TwoWeekValues = {
    kind: t.kind,
    before,
    after,
    ...(needsVolume ? { volume: Math.round(volume!) } : {}),
    ...(t.cv ? { cv: t.cv } : {}),
  }
  return { values, errors }
}

/** Where last week lands by chance: the week before ± the floor. */
export function chanceBand(r: TwoWeekReport): [number, number] | null {
  if (!r.floor) return null
  const lo = r.values.before - r.floor.absolute
  return [Math.max(0, lo), r.values.before + r.floor.absolute]
}
