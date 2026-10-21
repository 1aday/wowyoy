import {
  aliasSlug,
  dialectNames,
  dialects,
  familyNames,
  isReviewed,
  twoWeekTest,
  type Dialect,
  type MetricSpec,
  type NoiseVerdict,
} from "@workspace/metrics"
import { bandTable } from "./band"
import { formatAmount } from "./format"
import { QUERY_SCHEMAS, emitQuery, schemaLine } from "./query"
import { absolute, paths, type FlukeTwoInput } from "./site"
import { describeMeasure } from "./twin"

/**
 * The MCP server's three read-only tools, as pure functions over the published specs.
 * The /mcp route only speaks the protocol; everything a tool says is decided here.
 * Every result names its source URL so a model's citation resolves to a real page.
 */

export interface ToolDefinition {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { title: string; readOnlyHint: true; destructiveHint: false; idempotentHint: true; openWorldHint: false }
}

export interface ToolResult {
  content: { type: "text"; text: string }[]
  structuredContent?: Record<string, unknown>
  isError: boolean
}

const annotations = (title: string) =>
  ({ title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }) as const

const metricArg = {
  type: "string",
  minLength: 1,
  maxLength: 120,
  description: 'The metric: its id ("checkout-conversion"), any alias ("Checkout completion rate") or its name.',
}

export const tools: ToolDefinition[] = [
  {
    name: "define",
    title: "Define a metric",
    description:
      "Look up a weekly business metric in the wowyoy Standard: its one-line definition, formula, the events it is computed from, how its parts are counted, how much it wobbles by chance, and the pitfalls that make it lie. Use it to answer what a metric means or how to measure it consistently. Returns the canonical page URL to cite.",
    inputSchema: { type: "object", properties: { metric: metricArg }, required: ["metric"], additionalProperties: false },
    annotations: annotations("Define a metric"),
  },
  {
    name: "query",
    title: "Get a metric's weekly SQL",
    description:
      "Get the runnable weekly query for a metric in one SQL dialect: HogQL (paste into PostHog), Postgres, BigQuery or Snowflake. The query returns one row per complete week (Monday 00:00 UTC) with the measures and the value. Also returns the table and columns the query reads, so it can be adapted to another schema.",
    inputSchema: {
      type: "object",
      properties: {
        metric: metricArg,
        dialect: { type: "string", enum: [...dialects], description: "hogql (PostHog), postgres, bigquery or snowflake." },
        breakdown: {
          type: "string",
          pattern: "^\\$?[A-Za-z_][A-Za-z0-9_.]*$",
          description: "Optional: split every week by this event property, e.g. $device_type, utm_source, plan.",
        },
        weeks: { type: "integer", minimum: 1, maximum: 520, description: "Complete weeks to return, ending last week. Default 26." },
      },
      required: ["metric", "dialect"],
      additionalProperties: false,
    },
    annotations: annotations("Get a metric's weekly SQL"),
  },
  {
    name: "fluke",
    title: "Is a weekly move real?",
    description:
      "Test whether a week-over-week change is a real move or ordinary noise, from two numbers (last week, this week) and the weekly volume behind them. Give a metric to use its noise model, or a kind: rate (a share, e.g. conversion; volume = trials a week), count (things that happen, e.g. orders; no volume needed), amount (money summed over orders; volume = orders a week) or average (money per order; volume = orders a week). Rates may be fractions (0.041) or percents (4.1). Returns the call (real, edge, noise or too-few), a one-line reason, the noise floor at that volume and a link to the Fluke Test with these inputs.",
    inputSchema: {
      type: "object",
      properties: {
        metric: { ...metricArg, description: `${metricArg.description} Optional; sets the kind and spread.` },
        kind: { type: "string", enum: ["rate", "count", "amount", "average"], description: "Needed when no metric is given." },
        before: { type: "number", description: "Last week's value." },
        after: { type: "number", description: "This week's value." },
        volume: { type: "number", exclusiveMinimum: 0, description: "Trials a week for rates; orders a week for amounts and averages." },
        cv: {
          type: "number",
          exclusiveMinimum: 0,
          maximum: 10,
          description: "Amounts and averages: how much one order's value varies (sd ÷ mean). Default 1, or the metric's own.",
        },
      },
      required: ["before", "after"],
      additionalProperties: false,
    },
    annotations: annotations("Is a weekly move real?"),
  },
]

export const SERVER_INSTRUCTIONS =
  "wowyoy's Standard: canonical definitions of weekly business metrics (traffic, conversion, revenue, customers, activation, subscription, engagement), each with runnable SQL and a noise model. Use define to explain a metric, query to get SQL that computes it, and fluke to judge whether a week-over-week move is real. Cite the source URL each result gives."

const norm = (s: string) => aliasSlug(s.replace(/_/g, "-"))

/** Find a spec by id, alias, name or product catalog id. */
export function resolveMetric(input: string, specs: readonly MetricSpec[]): MetricSpec | null {
  const key = norm(input)
  if (!key) return null
  return (
    specs.find((s) => s.id === key) ??
    specs.find(
      (s) => norm(s.name) === key || s.aliases.some((a) => norm(a) === key) || (s.catalog_id != null && norm(s.catalog_id) === key)
    ) ??
    null
  )
}

/** Up to five ids that share a word with the input, for "did you mean". */
function suggest(input: string, specs: readonly MetricSpec[]) {
  const words = norm(input)
    .split("-")
    .filter((w) => w.length > 2)
  return specs
    .map((s) => ({
      s,
      score: words.filter((w) => s.id.includes(w) || norm(s.name).includes(w) || s.aliases.some((a) => norm(a).includes(w))).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.s.id.localeCompare(b.s.id))
    .slice(0, 5)
    .map((x) => x.s.id)
}

const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true })
const ok = (text: string, structured: Record<string, unknown>): ToolResult => ({
  content: [{ type: "text", text }],
  structuredContent: structured,
  isError: false,
})

function unknownMetric(input: string, specs: readonly MetricSpec[]) {
  if (!specs.length) return fail("No metrics are published yet: the Standard is being reviewed. See https://wowyoy.com/m.")
  const near = suggest(input, specs)
  return fail(
    `No metric called "${input}" in the Standard.${near.length ? ` Did you mean: ${near.join(", ")}?` : ""} Every id is listed at ${absolute(paths.llms())}.`
  )
}

const str = (v: unknown) => (typeof v === "string" ? v : null)
const numArg = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

function define(args: Record<string, unknown>, specs: readonly MetricSpec[]): ToolResult {
  const input = str(args.metric)
  if (!input) return fail('"metric" is required: an id, alias or name.')
  const spec = resolveMetric(input, specs)
  if (!spec) return unknownMetric(input, specs)
  const source = absolute(paths.metric(spec.id))
  const measures = Object.fromEntries(
    (["numerator", "subtract", "denominator"] as const).flatMap((k) =>
      spec[k] ? [[k, { label: spec[k].label, how: describeMeasure(spec[k]).replace(/`/g, "") }]] : []
    )
  )
  const band = spec.noise.type === "process" ? null : bandTable(spec).map((r) => ({ volume: r.volume, still_noise: r.moveLabel }))
  const structured = {
    id: spec.id,
    name: spec.name,
    aliases: spec.aliases,
    family: familyNames[spec.family],
    kind: spec.kind,
    polarity: spec.polarity,
    definition: spec.definition.one_line,
    formula: spec.definition.formula,
    measures,
    events: spec.events.map((e) => ({ name: e.name, description: e.description, also_called: e.also_called, properties: e.properties })),
    noise: {
      type: spec.noise.type,
      volume_unit: spec.noise.volume_unit,
      too_few_below: spec.noise.min_denominator,
      typical: formatAmount(spec, spec.noise.typical),
      band,
    },
    why_it_matters: spec.prose.why_it_matters,
    pitfalls: spec.prose.pitfalls,
    status: isReviewed(spec) ? "reviewed" : "draft",
    source,
    markdown: absolute(paths.metricFile(spec.id, "md")),
  }
  const text = [
    `${spec.name}: ${spec.definition.one_line}`,
    `Formula: ${spec.definition.formula}`,
    ...Object.entries(measures).map(([k, m]) => `${k[0]!.toUpperCase()}${k.slice(1)}: ${m.label} (${m.how})`),
    `Events: ${spec.events.map((e) => `${e.name} (${e.description.replace(/\.$/, "")})`).join("; ")}`,
    band
      ? `Noise: at ${band.map((b) => `${b.volume.toLocaleString("en-US")} ${spec.noise.volume_unit}, ${b.still_noise}`).join("; ")} is still chance.`
      : "Noise: no sampling floor; judged on its own week-to-week range.",
    `Pitfalls:\n${spec.prose.pitfalls.map((p) => `- ${p}`).join("\n")}`,
    ...(isReviewed(spec) ? [] : ["Status: draft, not yet reviewed."]),
    `Source: ${source}`,
  ].join("\n")
  return ok(text, structured)
}

function query(args: Record<string, unknown>, specs: readonly MetricSpec[]): ToolResult {
  const input = str(args.metric)
  if (!input) return fail('"metric" is required: an id, alias or name.')
  const dialect = str(args.dialect)
  if (!dialect || !(dialects as readonly string[]).includes(dialect)) return fail(`"dialect" must be one of: ${dialects.join(", ")}.`)
  const breakdown = args.breakdown == null ? undefined : str(args.breakdown)
  if (breakdown === null || (breakdown != null && !/^\$?[A-Za-z_][A-Za-z0-9_.]*$/.test(breakdown)))
    return fail('"breakdown" must be a plain property name such as $device_type or utm_source.')
  const weeks = args.weeks == null ? 26 : numArg(args.weeks)
  if (weeks == null || !Number.isInteger(weeks) || weeks < 1 || weeks > 520) return fail('"weeks" must be a whole number from 1 to 520.')
  const spec = resolveMetric(input, specs)
  if (!spec) return unknownMetric(input, specs)
  const d = dialect as Dialect
  const sql = emitQuery(spec, d, { weeks, breakdown })
  const source = absolute(paths.metric(spec.id))
  if (!sql) {
    return fail(
      spec.queries
        ? `${spec.name} uses a hand-written query with no split form. Ask without "breakdown". Source: ${source}`
        : `${spec.name} counts first-time or returning people, which can't be split by a property. Ask without "breakdown". Source: ${source}`
    )
  }
  const schema = QUERY_SCHEMAS[d]
  const structured = {
    metric: spec.id,
    name: spec.name,
    dialect: d,
    sql,
    weeks: spec.queries ? 26 : weeks,
    breakdown: breakdown ?? null,
    week: "Monday 00:00 UTC to Monday 00:00 UTC",
    schema: { table: schema.table, columns: schema.columns, notes: schema.notes },
    source,
  }
  const reads = d === "hogql" ? "Runs as is in a PostHog SQL insight (events table)." : `Reads ${schemaLine(d)}. ${schema.notes}`
  const text = [`${spec.name}, weekly, in ${dialectNames[d]}.`, reads, "```sql", sql, "```", `Source: ${source}`].join("\n")
  return ok(text, structured)
}

type Kind = FlukeTwoInput["kind"]
const kindOf: Record<MetricSpec["noise"]["type"], Kind | null> = {
  binomial: "rate",
  poisson: "count",
  compound: "amount",
  mean: "average",
  process: null,
}

function fluke(args: Record<string, unknown>, specs: readonly MetricSpec[]): ToolResult {
  let before = numArg(args.before)
  let after = numArg(args.after)
  if (before == null || after == null) return fail('"before" and "after" are required numbers: last week and this week.')
  const volume = args.volume == null ? undefined : (numArg(args.volume) ?? NaN)
  if (volume !== undefined && !(volume > 0)) return fail('"volume" must be a positive number.')
  const cvArg = args.cv == null ? undefined : (numArg(args.cv) ?? NaN)
  if (cvArg !== undefined && !(cvArg > 0 && cvArg <= 10)) return fail('"cv" must be a number above 0 and at most 10.')

  let spec: MetricSpec | null = null
  let kind: Kind | null = null
  if (args.metric != null) {
    const input = str(args.metric)
    if (!input) return fail('"metric" must be a string.')
    spec = resolveMetric(input, specs)
    if (!spec) return unknownMetric(input, specs)
    kind = kindOf[spec.noise.type]
    if (!kind) {
      return fail(
        `${spec.name} has no sampling floor, so two numbers can't settle it: it is judged on its own week-to-week range. Paste at least 6 weeks into the Fluke Test: ${absolute(paths.fluke())}. Source: ${absolute(paths.metric(spec.id))}`
      )
    }
  } else {
    const k = str(args.kind)
    if (!k || !["rate", "count", "amount", "average"].includes(k))
      return fail('Give a "metric", or a "kind": rate, count, amount or average.')
    kind = k as Kind
  }
  const cv = cvArg ?? spec?.noise.cv ?? 1

  // Rates may come as percents; read both as percents if either is above 1.
  const percent = kind === "rate" && (before > 1 || after > 1)
  if (percent) [before, after] = [before / 100, after / 100]
  if (kind === "rate" && (before < 0 || before > 1 || after < 0 || after > 1))
    return fail("Rates must be between 0 and 1, or 0 and 100 as percents.")
  if (kind !== "count" && volume == null) {
    return fail(
      kind === "rate"
        ? '"volume" is required for a rate: the trials a week it is out of (sessions, checkouts).'
        : '"volume" is required: orders a week.'
    )
  }

  const verdict: NoiseVerdict | null = twoWeekTest({ kind, before, after, volume, cv })
  if (!verdict) return fail("Those numbers can't be tested: check that they are finite and that counts are positive.")

  const flukeUrl = absolute(
    paths.flukeTwo({
      kind,
      before: kind === "rate" ? before * 100 : before,
      after: kind === "rate" ? after * 100 : after,
      volume,
      cv: kind === "amount" || kind === "average" ? cv : undefined,
    })
  )
  const fmt = (v: number) =>
    kind === "rate"
      ? `${(v * 100).toFixed(2)}%`
      : kind === "count"
        ? Math.round(v).toLocaleString("en-US")
        : v.toLocaleString("en-US", { maximumFractionDigits: 2 })
  const floorText =
    verdict.floor == null
      ? null
      : kind === "rate"
        ? `±${(verdict.floor * 100).toFixed(2)} pt`
        : `±${verdict.floor.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
  const source = spec ? absolute(paths.metric(spec.id)) : absolute(paths.fluke())
  const structured = {
    call: verdict.call,
    headline: verdict.headline,
    reason: verdict.reason,
    kind,
    before: verdict.before,
    after: verdict.after,
    change: verdict.change,
    relative_change: verdict.relativeChange,
    volume: kind === "count" ? null : volume!,
    floor: verdict.floor,
    one_in_weeks: verdict.oneInWeeks === Infinity ? null : verdict.oneInWeeks,
    metric: spec ? { id: spec.id, name: spec.name, url: absolute(paths.metric(spec.id)) } : null,
    fluke_url: flukeUrl,
    source,
  }
  const text = [
    `${verdict.headline} ${verdict.reason}`,
    `${spec ? `${spec.name}: ` : ""}${fmt(verdict.before)} → ${fmt(verdict.after)}${floorText ? `; chance alone moves it ${floorText} at this volume` : ""}.`,
    `Fluke Test with these inputs: ${flukeUrl}`,
    `Source: ${source}`,
  ].join("\n")
  return ok(text, structured)
}

const handlers: Record<string, (args: Record<string, unknown>, specs: readonly MetricSpec[]) => ToolResult> = { define, query, fluke }

export const hasTool = (name: string) => Object.hasOwn(handlers, name)

/** Run a tool. Bad input comes back as a tool error the model can read and correct, never a throw. */
export function callTool(name: string, args: unknown, specs: readonly MetricSpec[]): ToolResult {
  const handler = handlers[name]
  if (!handler) return fail(`Unknown tool "${name}". Tools: ${tools.map((t) => t.name).join(", ")}.`)
  if (args != null && (typeof args !== "object" || Array.isArray(args))) return fail("Arguments must be an object.")
  const a = (args ?? {}) as Record<string, unknown>
  const allowed = Object.keys((tools.find((t) => t.name === name)!.inputSchema.properties as Record<string, unknown>) ?? {})
  const extra = Object.keys(a).filter((k) => !allowed.includes(k))
  if (extra.length) return fail(`Unknown argument${extra.length > 1 ? "s" : ""}: ${extra.join(", ")}. Accepted: ${allowed.join(", ")}.`)
  try {
    return handler(a, specs)
  } catch (e) {
    return fail(`The tool failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}
