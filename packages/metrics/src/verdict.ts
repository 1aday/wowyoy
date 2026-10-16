import { metricById, type MetricId } from "./catalog"
import { DOWN, UP, formatChange } from "./format"
import { delta, type Delta } from "./stats"
import type { WeekRow } from "./sample"

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

export type VerdictPart = { text: string; tone?: "up" | "down" }

export interface Verdict {
  parts: VerdictPart[]
  text: string
  driver: MetricId | null
  headlineMetric: MetricId
}

function arrowPct(d: Delta) {
  const pct = Math.abs(d.relative * 100)
  return `${d.direction === "down" ? DOWN : UP}${pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`
}

export function verdict(rows: WeekRow[], i: number): Verdict {
  const rev = delta(rows, "revenue", i, "wow")
  const moved = drivers
    .map((d) => ({ ...d, delta: delta(rows, d.id, i, "wow") }))
    .filter((d): d is typeof d & { delta: Delta } => !!d.delta?.significant)
    .sort((a, b) => Math.abs(b.delta.z) - Math.abs(a.delta.z))

  const parts: VerdictPart[] = []
  let driver: MetricId | null = null

  if (rev?.significant) {
    parts.push({ text: "Revenue " }, { text: arrowPct(rev), tone: rev.direction === "down" ? "down" : "up" }, { text: ". " })
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
    const def = metricById[m.id]
    const flat = !rev || Math.abs(rev.relative) < 0.01
    parts.push(
      ...(flat
        ? [{ text: "Revenue flat. " }]
        : [
            { text: "Revenue " },
            { text: arrowPct(rev), tone: rev.direction === "down" ? ("down" as const) : ("up" as const) },
            { text: ", within normal. " },
          ]),
      { text: `${m.noun} ` },
      { text: formatChange(def.kind, m.delta.change), tone: m.delta.direction === "down" ? "down" : "up" },
      { text: " is the one to watch." },
    )
  } else {
    parts.push({ text: "Nothing moved beyond noise." })
  }

  return { parts, text: parts.map((p) => p.text).join(""), driver, headlineMetric: "revenue" }
}
