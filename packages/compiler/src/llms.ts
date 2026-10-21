import { families, familyNames, type MetricSpec } from "@workspace/metrics"
import { absolute, paths, site } from "./site"
import { metricMarkdown, whyTitle } from "./twin"
import { whyPages } from "./why"

/**
 * /llms.txt and /llms-full.txt, per llmstxt.org: an H1, a blockquote summary, then H2 sections
 * of Markdown links. Every link is to a Markdown twin, so a model reads text, not HTML.
 */

export function llmsTxt(published: readonly MetricSpec[]): string {
  const out: string[] = [
    `# ${site.name}`,
    `> ${site.summary} Its public pages are compiled from reviewed metric specs: the Standard defines each weekly metric once, with a formula, four runnable SQL queries (HogQL, Postgres, BigQuery, Snowflake) and a noise band that says how big a week-over-week move must be to be real.`,
    [
      "Every Standard and Why page has a Markdown twin at the same URL plus `.md`; Standard pages also have `.json` (spec plus compiled queries and noise band) and `.yaml` (the spec as written).",
      "Content is MIT licensed. Cite the page URL given at the bottom of each file.",
    ].join(" "),
  ]

  if (!published.length) {
    out.push(
      "## The Standard",
      `The Standard is being reviewed; no metrics are published yet. [The Standard](${absolute(paths.standard())}) lists them as they are.`
    )
  } else {
    for (const f of families) {
      const specs = published.filter((s) => s.family === f).sort((a, b) => a.name.localeCompare(b.name))
      if (!specs.length) continue
      out.push(
        `## The Standard: ${familyNames[f]}`,
        specs.map((s) => `- [${s.name}](${absolute(paths.metricFile(s.id, "md"))}): ${s.definition.one_line}`).join("\n")
      )
    }
  }

  out.push(
    "## Weekly record",
    `- [Monday Ledger](${absolute(paths.ledger())}): one frozen page per closed ISO week (Monday to Sunday, UTC) with the calendar and outside events that move weekly numbers; each week has a \`.md\` twin, e.g. ${absolute(paths.weekFile("2026-w43"))}.`
  )

  out.push(
    "## Tools",
    [
      `- [Fluke Test](${absolute(paths.fluke())}): is a week-over-week move real or noise? Paste a weekly series, or two numbers and a volume.`,
      `- [Fluke Test API](${absolute(paths.flukeApi())}): the same verdict as JSON. GET with \`kind\` (rate, count, amount or average), \`before\`, \`after\` and \`volume\` (rates in percent), or \`values\` for a weekly series.`,
      `- [MCP server](${absolute(paths.mcp())}): Streamable HTTP, no auth. Tools: \`define\` (a metric's definition, formula, events and pitfalls), \`query\` (its weekly SQL in one dialect, with the schema it reads) and \`fluke\` (two-number verdict).`,
    ].join("\n")
  )

  const why = whyPages(published)
  if (why.length) {
    out.push(
      "## Optional",
      why.map((w) => `- [${whyTitle(w.spec, w.direction)}](${absolute(paths.whyFile(w.spec.id, w.direction))})`).join("\n")
    )
  }
  return out.join("\n\n") + "\n"
}

/** Every published Standard page as Markdown, one after another. */
export function llmsFullTxt(published: readonly MetricSpec[]): string {
  const head = [
    `# ${site.name}: the Standard, in full`,
    `> Every published metric definition on ${site.url}, as Markdown: definition, formula, events, weekly queries in four SQL dialects, noise band, drivers and pitfalls. ${site.license.name} licensed.`,
  ]
  if (!published.length) return [...head, "The Standard is being reviewed; no metrics are published yet."].join("\n\n") + "\n"
  const sorted = families.flatMap((f) => published.filter((s) => s.family === f).sort((a, b) => a.name.localeCompare(b.name)))
  return [head.join("\n\n"), ...sorted.map((s) => metricMarkdown(s, { published }).trimEnd())].join("\n\n---\n\n") + "\n"
}
