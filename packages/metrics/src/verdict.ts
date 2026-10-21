import { metricById, type MetricId } from "./catalog"
import { DOWN, UP, formatChange } from "./format"
import { delta, type Delta } from "./stats"
import type { MetricWeek } from "./series"

/**
 * The headline states the answer, written by fixed rules from the data
 * (brand rule 7: "the biggest type states the answer"). No model writes this line.
 */

const drivers: { id: MetricId; noun: string }[] = [
  { id: "sessions", noun: "Traffic" },
  { id: "product_view_rate", noun: "Product discovery" },
  { id: "add_to_cart_rate", noun: "Add to cart" },
  { id: "checkout_start_rate", noun: "Checkout start" },
  { id: "checkout_completion_rate", noun: "Checkout" },
  { id: "aov", noun: "Order value" },
]

/** The number the headline leads with: revenue when the source has it, otherwise the next best outcome. */
const leads: { id: MetricId; noun: string }[] = [
  { id: "revenue", noun: "Revenue" },
  { id: "orders", noun: "Orders" },
  { id: "sessions", noun: "Traffic" },
]

export type VerdictPart = { text: string; tone?: "up" | "down" }

export interface Verdict {
  parts: VerdictPart[]
  text: string
  driver: MetricId | null
  headlineMetric: MetricId
  /** The week in one word, for the Year in Mondays strip: a move beyond noise up or down, or neither. */
  state: "up" | "down" | "flat"
}

function arrowPct(d: Delta) {
  const pct = Math.abs(d.relative * 100)
  return `${d.direction === "down" ? DOWN : UP}${pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`
}

const tone = (d: Delta) => (d.direction === "down" ? ("down" as const) : ("up" as const))

export function verdict(rows: readonly MetricWeek[], i: number): Verdict {
  const lead = leads.find((l) => rows[i]?.values[l.id] != null) ?? leads[0]!
  const rev = delta(rows, lead.id, i, "wow")
  const moved = drivers
    .filter((d) => d.id !== lead.id)
    .map((d) => ({ ...d, delta: delta(rows, d.id, i, "wow") }))
    .filter((d): d is typeof d & { delta: Delta } => !!d.delta?.significant)
    .sort((a, b) => Math.abs(b.delta.z) - Math.abs(a.delta.z))

  const parts: VerdictPart[] = []
  let driver: MetricId | null = null
  let state: Verdict["state"] = "flat"

  if (rev?.significant) {
    state = tone(rev)
    parts.push({ text: `${lead.noun} ` }, { text: arrowPct(rev), tone: tone(rev) }, { text: ". " })
    const same = moved.find((m) => m.delta.direction === rev.direction)
    if (same) {
      driver = same.id
      parts.push({ text: rev.direction === "down" ? `${same.noun} is the leak.` : `${same.noun} did it.` })
    } else {
      parts.push({ text: "No single step explains it." })
    }
  } else if (moved[0]) {
    const m = moved[0]
    driver = m.id
    state = tone(m.delta)
    const def = metricById[m.id]
    const flat = !rev || Math.abs(rev.relative) < 0.01
    parts.push(
      ...(flat
        ? [{ text: `${lead.noun} flat. ` }]
        : [{ text: `${lead.noun} ` }, { text: arrowPct(rev), tone: tone(rev) }, { text: ", within normal. " }]),
      { text: `${m.noun} ` },
      { text: formatChange(def.kind, m.delta.change), tone: tone(m.delta) },
      { text: " is the one to watch." },
    )
  } else {
    parts.push({ text: "Nothing moved beyond noise." })
  }

  return { parts, text: parts.map((p) => p.text).join(""), driver, headlineMetric: lead.id, state }
}

/** A year of Mondays: every week's headline, oldest first, ending at `end`. */
export function yearInMondays(rows: readonly MetricWeek[], end = rows.length - 1, weeks = 52) {
  const out: { index: number; week: string; verdict: Verdict }[] = []
  for (let i = Math.max(1, end - weeks + 1); i <= end; i++) out.push({ index: i, week: rows[i]!.week, verdict: verdict(rows, i) })
  return out
}
