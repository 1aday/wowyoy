import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { z } from "zod/v4"
import { mappedMeasures, measureInfo, newCustomersInfo, type Mapping, type MeasureSpec } from "./mapping"
import type { DiscoveredEvent } from "./posthog"

/**
 * Claude reads the project's event menu once, at setup, and proposes which event each measure
 * reads. Its answer is checked against the events that exist and then shown for review.
 * Claude never writes queries and never runs on Mondays.
 */

export const MAPPING_MODEL = "claude-opus-5-5"

const choice = z.object({
  event: z.string().nullable().describe("Exact event name from the list, or null if nothing fits."),
  filter_property: z.string().nullable().describe("Only when one event covers several steps, e.g. $pageview on product URLs."),
  filter_op: z.enum(["contains", "equals"]).nullable(),
  filter_value: z.string().nullable(),
  property: z.string().nullable().describe("Numeric property to sum. Only for revenue and spend."),
  confidence: z.number().describe("0 to 1: how sure you are this is the right event."),
  reason: z.string().describe("One short sentence a founder can check, naming the evidence."),
})

const answer = z.object({
  sessions: choice,
  product_views: choice,
  carts: choice,
  checkouts: choice,
  orders: choice,
  revenue: choice,
  spend: choice,
  notes: z.string().describe("Anything the founder should know, in one or two sentences. Empty if nothing."),
})

const SYSTEM = `You map a company's product analytics events to a fixed set of growth measures for wowyoy, a weekly growth report.

Each measure is computed by a fixed query from the event you choose:
${mappedMeasures.map((m) => `- ${m}: ${measureInfo[m].name}. ${measureInfo[m].reads} Aggregate: ${measureInfo[m].aggregate === "sessions" ? "distinct sessions" : measureInfo[m].aggregate === "count" ? "event count" : "sum of a numeric property"}.`).join("\n")}
- ${newCustomersInfo.name} is derived automatically from the orders event; you don't choose it.

Rules:
- Only use event and property names that appear in the list you're given, spelled exactly.
- One order must be exactly one event. Prefer the server-side or payment-confirmed event over a thank-you pageview when both exist.
- Revenue sums a numeric property on the orders event (or a separate payment event). Prefer net or total order value over item price.
- If nothing fits a measure, return null for its event. A wrong mapping is worse than a missing one.
- Confidence: 0.9+ when the name and properties leave no doubt, 0.6-0.8 when it's a judgment call, below 0.6 when it's a guess.`

function describe(events: DiscoveredEvent[]) {
  return events
    .slice(0, 120)
    .map((e) => {
      const props = e.properties?.length
        ? ` | properties: ${e.properties
            .slice(0, 25)
            .map((p) => `${p.key}${p.numeric ? " (number)" : ""}${p.example ? `="${p.example.slice(0, 40)}"` : ""}`)
            .join(", ")}`
        : ""
      return `${e.event} | ${e.events} events, ${e.sessions} sessions in 30 days${props}`
    })
    .join("\n")
}

export interface ClaudeMappingResult {
  mapping: Mapping
  notes: string
}

export async function claudeMapping(events: DiscoveredEvent[], rules: Mapping, apiKey: string): Promise<ClaudeMappingResult> {
  const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 })
  const response = await client.beta.messages.parse({
    model: MAPPING_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "medium", format: betaZodOutputFormat(answer) },
    messages: [
      {
        role: "user",
        content: `Events in the last 30 days, by volume:\n${describe(events)}\n\nA simple name-matching pass proposed:\n${JSON.stringify(
          Object.fromEntries(mappedMeasures.map((m) => [m, rules[m] ? { event: rules[m]!.event, filter: rules[m]!.filter, property: rules[m]!.property } : null])),
        )}\n\nPropose the mapping.`,
      },
    ],
  })
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error("Claude didn't return a mapping.")
  const out = response.parsed_output
  const known = new Map(events.map((e) => [e.event, e]))
  const mapping: Mapping = { newCustomers: true }
  for (const m of mappedMeasures) {
    const c = out[m]
    const ev = c.event ? known.get(c.event) : undefined
    if (!c.event || !ev) continue
    if (measureInfo[m].needsProperty && !c.property) continue
    const spec: MeasureSpec = {
      event: c.event,
      confidence: Math.max(0, Math.min(1, c.confidence)),
      source: "claude",
      reason: c.reason.slice(0, 400),
    }
    if (c.filter_property && c.filter_op && c.filter_value) spec.filter = { property: c.filter_property, op: c.filter_op, value: c.filter_value }
    if (measureInfo[m].needsProperty && c.property) spec.property = c.property
    mapping[m] = spec
  }
  return { mapping, notes: out.notes }
}
