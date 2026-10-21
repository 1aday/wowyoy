import { DOWN, UP, type NoiseCall, type NoiseVerdict } from "@workspace/metrics"
import { measureInfo, repoMeasures, type MeasureRead, type RepoMeasure, type RepoPulse } from "./types"

/**
 * The words on a Repo Pulse page and badge, written from the numbers by fixed rules.
 */

export interface HeadlinePart {
  text: string
  tone?: "up" | "down"
}

export type Direction = "up" | "down" | "flat"

/** A relative change as the page prints it, without sign: "41%", "3.2%". */
export function percentText(relative: number) {
  const pct = Math.abs(relative * 100)
  return `${pct.toFixed(pct < 10 ? 1 : 0)}%`
}

export function directionOf(v: Pick<NoiseVerdict, "before" | "after" | "relativeChange">): Direction {
  if (v.after === v.before) return "flat"
  if (v.before > 0 && percentText(v.relativeChange) === "0.0%") return "flat"
  return v.after > v.before ? "up" : "down"
}

/** "▲41%", "▼3.2%", or the count when there's no base to compare with ("▲12"). */
export function moveText(v: Pick<NoiseVerdict, "before" | "after" | "relativeChange">) {
  const dir = directionOf(v)
  const glyph = dir === "up" ? UP : dir === "down" ? DOWN : "●"
  if (v.before === 0) return `${glyph}${Math.abs(v.after - v.before).toLocaleString("en-US")}`
  return `${glyph}${percentText(v.relativeChange)}`
}

const weeksText = (n: number | null) =>
  n == null || !Number.isFinite(n) ? "almost never" : n <= 1 ? "most weeks" : `about once every ${n.toLocaleString("en-US")} weeks`

/** Why a week got its call, one plain sentence about the repo. */
export function whyText(v: Pick<NoiseVerdict, "call" | "clearsFloor" | "oneInWeeks" | "reason" | "process">) {
  switch (v.call) {
    case "real":
      return `Chance alone makes a move this size ${weeksText(v.oneInWeeks)} at this count${v.process ? ", and it breaks the repo's usual week-to-week range" : ""}.`
    case "noise":
      return v.clearsFloor === false
        ? `At this count, chance alone moves it this much ${weeksText(v.oneInWeeks)}.`
        : "Weeks like this are inside the repo's usual range."
    case "too-few":
      return "Under 10 a week, chance moves the count more than most real changes do."
    default:
      return v.reason
  }
}

export const callWords: Record<NoiseCall, string> = { real: "real", edge: "edge", noise: "noise", "too-few": "too few" }

export interface WeekCall {
  measure: RepoMeasure
  value: number
  verdict: NoiseVerdict
}

/** Each measure's verdict for the latest closed week, in measure order. */
export function latestCalls(pulse: Pick<RepoPulse, "closed" | "measures">): WeekCall[] {
  const i = pulse.closed - 1
  return pulse.measures.flatMap((m) => {
    const v = m.calls[i]
    const value = m.counts[i]
    return v && value != null ? [{ measure: m.measure, value, verdict: v }] : []
  })
}

/** Real moves first by size, so the headline names the biggest one. */
export function realMoves(calls: readonly WeekCall[]) {
  return calls.filter((c) => c.verdict.call === "real").sort((a, b) => Math.abs(b.verdict.relativeChange) - Math.abs(a.verdict.relativeChange))
}

const tone = (v: NoiseVerdict): HeadlinePart["tone"] => (directionOf(v) === "up" ? "up" : directionOf(v) === "down" ? "down" : undefined)

/**
 * The headline states the answer:
 * "Stars ▲41%. A real move." / "Stars ▲41% and forks ▲22%. Both real." /
 * "Stars ▲41% and 2 more real moves." / "Nothing moved beyond noise this week." / "Too quiet to call this week."
 */
export function repoHeadline(pulse: Pick<RepoPulse, "closed" | "measures">): HeadlinePart[] {
  const calls = latestCalls(pulse)
  const real = realMoves(calls)
  const [a, b] = real
  if (a && b && real.length === 2) {
    return [
      { text: `${measureInfo[a.measure].name} ` },
      { text: moveText(a.verdict), tone: tone(a.verdict) },
      { text: ` and ${measureInfo[b.measure].label} ` },
      { text: moveText(b.verdict), tone: tone(b.verdict) },
      { text: ". Both real." },
    ]
  }
  if (a && real.length > 2) {
    return [
      { text: `${measureInfo[a.measure].name} ` },
      { text: moveText(a.verdict), tone: tone(a.verdict) },
      { text: ` and ${real.length - 1} more real moves.` },
    ]
  }
  if (a) return [{ text: `${measureInfo[a.measure].name} ` }, { text: moveText(a.verdict), tone: tone(a.verdict) }, { text: ". A real move." }]
  if (calls.some((c) => c.verdict.call !== "too-few")) return [{ text: "Nothing moved beyond noise this week." }]
  return [{ text: "Too quiet to call this week." }]
}

export const headlineText = (parts: readonly HeadlinePart[]) => parts.map((p) => p.text).join("")

/** What the badge says. The arrow is drawn, so `value` carries no glyph. */
export interface BadgeRead {
  label: string
  /** "14% WoW · real" */
  value: string
  dir: Direction | null
  /** real = filled pill; plain = coloured text; muted = grey (too few, no data). */
  tone: "real" | "plain" | "muted"
  call: NoiseCall | null
  measure: RepoMeasure
}

/** The measure a badge shows when none is asked for: stars, unless stars have no history. */
export function defaultBadgeMeasure(pulse: Pick<RepoPulse, "closed" | "measures">): RepoMeasure {
  const calls = latestCalls(pulse)
  for (const m of repoMeasures) if (calls.some((c) => c.measure === m)) return m
  return "stars"
}

export function badgeRead(pulse: Pick<RepoPulse, "closed" | "measures">, measure?: RepoMeasure): BadgeRead {
  const pick = measure ?? defaultBadgeMeasure(pulse)
  const label = measureInfo[pick].label
  const m: MeasureRead | undefined = pulse.measures.find((x) => x.measure === pick)
  const i = pulse.closed - 1
  const v = m?.calls[i]
  if (!m || m.status === "unavailable" || !v) return { label, value: "no history yet", dir: null, tone: "muted", call: null, measure: pick }
  const dir = directionOf(v)
  const word = callWords[v.call]
  const amount = v.before === 0 ? `${Math.abs(v.after - v.before).toLocaleString("en-US")}` : percentText(v.relativeChange)
  return {
    label,
    value: `${amount} WoW · ${word}`,
    dir,
    tone: v.call === "real" ? "real" : v.call === "too-few" ? "muted" : "plain",
    call: v.call,
    measure: pick,
  }
}
