import { dialectNames, dialects, familyNames, isReviewed, type Measure, type MetricSpec } from "@workspace/metrics"
import { feedInfo } from "@workspace/feeds/info"
import { bandTable, volumeFor } from "./band"
import { formatAmount } from "./format"
import { QUERY_SCHEMAS, emitAll, schemaLine } from "./query"
import { absolute, paths, site, whyDirections, type WhyDirection } from "./site"
import { hasWhy, whySteps } from "./why"

/**
 * File twins: the same page as Markdown, JSON and YAML, compiled from the spec. Pure, so the
 * route handlers, llms-full.txt and the MCP server all serve byte-identical text.
 * `published` is the set this deployment shows; links only ever point at pages that exist.
 */

export const TWIN_FORMAT = "wowyoy.metric"
export const TWIN_FORMAT_VERSION = 1

const aggregateWords: Record<Measure["aggregate"], string> = {
  count: "Count of",
  unique_users: "Distinct people with",
  unique_sessions: "Distinct sessions with",
  sum: "Sum of",
  first_time_users: "People whose first ever",
  returning_users: "People seen in an earlier week with",
}

/** "Distinct sessions with `order_completed`", "Sum of `total` over `order_completed` where …" */
export function describeMeasure(m: Measure) {
  const ev = m.event === "*" ? "any event" : `\`${m.event}\``
  const head =
    m.aggregate === "sum"
      ? `Sum of \`${m.property}\` over ${ev}`
      : m.aggregate === "first_time_users"
        ? `People whose first ever ${ev} is that week`
        : `${aggregateWords[m.aggregate]} ${ev}`
  const where = m.where.map((f) => {
    const v =
      f.value == null
        ? ""
        : ` ${Array.isArray(f.value) ? `[${f.value.map((x) => JSON.stringify(x)).join(", ")}]` : JSON.stringify(f.value)}`
    return `\`${f.property}\` ${f.op.replace(/_/g, " ")}${v}`
  })
  return where.length ? `${head}, where ${where.join(" and ")}` : head
}

/** A metric name inside a sentence: "checkout conversion", but "MRR" stays as is. */
export function inSentence(name: string) {
  return /^[A-Z][a-z]/.test(name) ? name[0]!.toLowerCase() + name.slice(1) : name
}

export function whyTitle(spec: Pick<MetricSpec, "name">, direction: WhyDirection) {
  return `Why did ${inSentence(spec.name)} ${direction === "dropped" ? "drop" : "spike"}?`
}

const fence = (lang: string, body: string) => {
  const ticks = body.includes("```") ? "````" : "```"
  return `${ticks}${lang}\n${body}\n${ticks}`
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ")

function table(head: string[], rows: string[][]) {
  return [
    `| ${head.map(cell).join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
  ].join("\n")
}

function statusLine(spec: MetricSpec) {
  return isReviewed(spec)
    ? `Reviewed by ${spec.reviewed_by}${spec.reviewed_at ? ` on ${spec.reviewed_at}` : ""}. Version ${spec.version}.`
    : `Draft, not yet reviewed. Version ${spec.version}.`
}

/** The noise band as prose and a table, or the process explanation. */
function noiseSection(spec: MetricSpec): string[] {
  const n = spec.noise
  if (n.type === "process") {
    return [
      `${spec.name} has no sampling floor: it is a ${spec.kind === "currency" ? "stock or a ratio of sums" : "number with no single sampling unit"}, so chance alone can't be read from its volume.`,
      `A week is judged on the metric's own week-to-week behaviour instead: the move must break its usual range over the last 26 weeks (XmR limits). Below ${n.min_denominator.toLocaleString("en-US")} ${n.volume_unit}, it is too few to say.`,
    ]
  }
  const rows = bandTable(spec)
  const five = volumeFor(spec, 0.05)
  return [
    `How big a week-over-week move must be before it is more than chance, read at a typical value of ${formatAmount(spec, n.typical)}. A move inside the band is ordinary noise at that volume.`,
    table(
      ["Weekly volume", "Still noise"],
      rows.map((r) => [r.volumeLabel, r.moveLabel])
    ),
    [
      `Below ${n.min_denominator.toLocaleString("en-US")} ${n.volume_unit}, the answer is "too few to say", never a number.`,
      five ? `To see a 5% move reliably takes about ${five.toLocaleString("en-US")} ${n.volume_unit}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  ]
}

export interface TwinContext {
  /** The specs this deployment publishes. */
  published: readonly MetricSpec[]
}

const linkTo = (s: Pick<MetricSpec, "id" | "name">) => `[${s.name}](${absolute(paths.metric(s.id))})`

/** The Standard page as Markdown: everything on the page, in reading order, with absolute links. */
export function metricMarkdown(spec: MetricSpec, ctx: TwinContext): string {
  const byId = new Map(ctx.published.map((s) => [s.id, s]))
  const url = absolute(paths.metric(spec.id))
  const queries = emitAll(spec)
  const out: string[] = []

  out.push(`# ${spec.name}`, `> ${spec.definition.one_line}`)
  out.push(
    [
      `- **Formula:** ${spec.definition.formula}`,
      `- **Family:** ${familyNames[spec.family]}`,
      `- **Unit:** ${spec.kind === "duration" ? `duration, in ${spec.duration_unit ?? "days"}` : spec.kind}; ${spec.polarity === "up-is-good" ? "up is good" : "down is good"}`,
      ...(spec.aliases.length ? [`- **Also called:** ${spec.aliases.join(", ")}`] : []),
      `- **Status:** ${statusLine(spec)}`,
    ].join("\n")
  )

  out.push("## Why it matters", spec.prose.why_it_matters)

  out.push("## Definition")
  const measures = (
    [
      ["Numerator", spec.numerator],
      ["Minus", spec.subtract],
      ["Denominator", spec.denominator],
    ] as const
  ).filter((e): e is readonly ["Numerator" | "Minus" | "Denominator", Measure] => !!e[1])
  out.push(
    table(
      ["Part", "What", "How it's counted"],
      measures.map(([k, m]) => [k, m.label, describeMeasure(m)])
    )
  )
  const value = spec.denominator
    ? `(numerator${spec.subtract ? " − minus" : ""}) ÷ denominator`
    : spec.subtract
      ? "numerator − minus"
      : "numerator"
  out.push(
    spec.queries
      ? "Value: as the hand-written queries below compute it; the parts above describe what they read. Each week is Monday 00:00 to Monday 00:00 UTC."
      : `Value: ${value}, for each complete week from Monday 00:00 UTC. Null when the denominator is zero.`
  )

  out.push("## Events")
  for (const e of spec.events) {
    out.push(`### \`${e.name}\``, e.description)
    if (e.also_called.length) out.push(`Also called: ${e.also_called.map((a) => `\`${a}\``).join(", ")}.`)
    if (e.properties.length)
      out.push(
        table(
          ["Property", "Meaning"],
          e.properties.map((p) => [`\`${p.name}\``, p.description])
        )
      )
  }

  out.push(
    "## Weekly query",
    `One row per complete week, oldest first. HogQL runs as is in PostHog; the warehouse queries read one table of events. ${spec.queries ? "These are hand-written: the measures alone can't express this metric." : "Weeks with no events read as zero."}`
  )
  for (const d of dialects) {
    const sql = queries[d]
    if (!sql) continue
    out.push(`### ${dialectNames[d]}`)
    if (d !== "hogql") out.push(`Reads \`${schemaLine(d)}\`. ${QUERY_SCHEMAS[d].notes}`)
    out.push(fence("sql", sql))
  }

  out.push("## Noise band", ...noiseSection(spec))

  const steps = spec.diagnose_order.flatMap((id) => spec.drivers.filter((d) => d.id === id))
  if (steps.length) {
    out.push("## Drivers", "What to check when it moves, in the order an operator checks it.")
    steps.forEach((d, i) => {
      const linked = d.metric ? byId.get(d.metric) : undefined
      const notes = [
        linked ? `Standard: ${linkTo(linked)}` : "",
        d.breakdown ? `Split by \`${d.breakdown}\`` : "",
        d.feed ? `World feed: ${feedInfo[d.feed].name}` : "",
      ].filter(Boolean)
      out.push(
        [
          `### ${i + 1}. ${d.label}`,
          ...(notes.length ? [notes.join(" · ")] : []),
          "",
          `- **If it dropped:** ${d.dropped.check} A yes looks like: ${d.dropped.yes}`,
          `- **If it spiked:** ${d.spiked.check} A yes looks like: ${d.spiked.yes}`,
        ].join("\n")
      )
    })
    if (hasWhy(spec)) {
      out.push(whyDirections.map((dir) => `- [${whyTitle(spec, dir)}](${absolute(paths.why(spec.id, dir))})`).join("\n"))
    }
  }

  out.push("## Pitfalls", spec.prose.pitfalls.map((p) => `- ${p}`).join("\n"))

  const related = spec.related.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
  if (related.length) out.push("## Related", related.map((r) => `- ${linkTo(r)}: ${r.definition.one_line}`).join("\n"))

  out.push(
    "## Files",
    [
      `- Page: ${url}`,
      `- Markdown: ${absolute(paths.metricFile(spec.id, "md"))}`,
      `- JSON: ${absolute(paths.metricFile(spec.id, "json"))}`,
      `- Spec (YAML): ${absolute(paths.metricFile(spec.id, "yaml"))}`,
      `- Fluke Test: ${absolute(paths.fluke())}`,
    ].join("\n")
  )

  out.push("---", `Source: ${url} · ${site.license.name}`)
  return out.join("\n\n") + "\n"
}

/** Key order for the spec part of the JSON twin, so the file diffs cleanly between builds. */
const SPEC_KEYS = [
  "id",
  "name",
  "aliases",
  "family",
  "catalog_id",
  "kind",
  "duration_unit",
  "polarity",
  "definition",
  "events",
  "numerator",
  "subtract",
  "denominator",
  "queries",
  "noise",
  "example",
  "drivers",
  "diagnose_order",
  "related",
  "prose",
  "reviewed_by",
  "reviewed_at",
  "version",
] as const

/** Recursively sort object keys that aren't in a known order, so output never depends on insertion order. */
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable)
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, stable((v as Record<string, unknown>)[k])])
    )
  }
  return v
}

/** The JSON twin: the spec as written, plus everything the compiler derives from it. */
export function metricJson(spec: MetricSpec, ctx: TwinContext) {
  const specPart: Record<string, unknown> = {}
  for (const k of SPEC_KEYS) if (spec[k] !== undefined) specPart[k] = stable(spec[k])
  const queries = emitAll(spec)
  const queryPart: Record<string, unknown> = {}
  for (const d of dialects) queryPart[d] = { sql: queries[d], reads: d === "hogql" ? "PostHog events" : schemaLine(d) }
  const published = new Set(ctx.published.map((s) => s.id))
  return {
    format: TWIN_FORMAT,
    format_version: TWIN_FORMAT_VERSION,
    url: absolute(paths.metric(spec.id)),
    status: isReviewed(spec) ? "reviewed" : "draft",
    spec: specPart,
    compiled: {
      value: spec.queries
        ? null
        : spec.denominator
          ? "(numerator - subtract) / denominator"
          : spec.subtract
            ? "numerator - subtract"
            : "numerator",
      week: "Monday 00:00 UTC to Monday 00:00 UTC",
      queries: queryPart,
      noise_band:
        spec.noise.type === "process"
          ? null
          : bandTable(spec).map((r) => ({
              volume: r.volume,
              volume_label: r.volumeLabel,
              absolute: r.absolute,
              relative: r.relative,
              label: r.moveLabel,
            })),
      volume_for_5_percent: volumeFor(spec, 0.05),
      why: hasWhy(spec)
        ? whyDirections.map((d) => ({ direction: d, url: absolute(paths.why(spec.id, d)), markdown: absolute(paths.whyFile(spec.id, d)) }))
        : [],
      related: spec.related.filter((id) => published.has(id)).map((id) => absolute(paths.metric(id))),
      files: {
        markdown: absolute(paths.metricFile(spec.id, "md")),
        json: absolute(paths.metricFile(spec.id, "json")),
        yaml: absolute(paths.metricFile(spec.id, "yaml")),
      },
    },
    source: absolute(paths.metric(spec.id)),
    license: site.license.name,
  }
}

/** The Why page as Markdown: chance, the world, your business, always in that order. */
export function whyMarkdown(spec: MetricSpec, direction: WhyDirection, ctx: TwinContext): string {
  const steps = whySteps(spec, direction, ctx.published)
  const url = absolute(paths.why(spec.id, direction))
  const moved = direction === "dropped" ? "drop" : "rise"
  const out: string[] = [
    `# ${whyTitle(spec, direction)}`,
    `> Three checks, in order: chance, the world, then your business. Stop at the first one that explains the ${moved}.`,
    `${linkTo(spec)}: ${spec.definition.one_line}`,
  ]

  out.push(`## 1. Chance: is the ${moved} real?`)
  out.push(
    `Most weekly moves are noise. Put last week and this week into the [Fluke Test](${absolute(paths.fluke())}) with the week's volume (${spec.noise.volume_unit}); it calls the move real, on the edge or within noise.`,
    ...noiseSection(spec)
  )

  out.push("## 2. The world: did something outside move it?")
  if (steps.world.feeds.length) {
    out.push(
      "Check these for the same week before looking inside the business:",
      steps.world.feeds.map((f) => `- [${feedInfo[f].name}](${feedInfo[f].home})`).join("\n")
    )
  }
  out.push(`The [Monday Ledger](${absolute(paths.ledger())}) lists each closed week's calendar and outside events in one place.`)

  out.push("## 3. Your business: walk the drivers")
  if (!steps.business.length) out.push("This metric has no drivers yet.")
  for (const s of steps.business) {
    const lines = [`### ${s.n}. ${s.driver.label}`, `**Check:** ${s.check}`, "", `**A yes looks like:** ${s.yes}`]
    if (s.link) lines.push("", `Standard: [${s.link.name}](${absolute(s.link.path)})`)
    out.push(lines.join("\n"))
    const hog = s.queries?.hogql
    if (hog) {
      out.push(
        s.queryKind === "breakdown"
          ? `${spec.name} split by \`${s.driver.breakdown}\`, in HogQL:`
          : `${s.link?.name ?? "The driver"}, in HogQL:`,
        fence("sql", hog)
      )
    }
  }
  if (steps.business.some((s) => s.queries)) {
    out.push(
      `The same queries in Postgres, BigQuery and Snowflake: the splits by property on ${absolute(paths.metricFile(spec.id, "md"))}, the others on each linked metric's page.`
    )
  }

  out.push("---", `Source: ${url} · ${site.license.name}`)
  return out.join("\n\n") + "\n"
}
