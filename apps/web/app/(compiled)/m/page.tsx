import type { Metadata } from "next"
import { ArrowUpRight } from "lucide-react"
import { absolute, bandAt, paths, robotsMeta } from "@workspace/compiler"
import { allSpecs, families, familyNames, isReviewed, publishedSpecs } from "@workspace/metrics"
import { Prompt } from "@workspace/ui/brand/prompt"
import { DraftMark } from "@/components/standard/draft-mark"
import { MetricIndex, type IndexFamily, type IndexItem } from "@/components/standard/metric-index"
import { Page } from "@/components/standard/page-section"
import { kindLabel } from "@/lib/standard/spec-view"

const VOLUME = 800
const REPO = "https://github.com/1aday/wowyoy"

const title = "The Standard: open definitions for growth metrics"
const description =
  "Every growth metric defined once: the formula, the query in HogQL, Postgres, BigQuery and Snowflake, the noise band, and what to check when it moves. Open source, MIT."

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: absolute(paths.standard()) },
  robots: robotsMeta({ kind: "fixed", path: paths.standard() }),
  openGraph: { title, description, url: absolute(paths.standard()), siteName: "wowyoy" },
}

const machineLinks = [
  { href: paths.llms(), label: "llms.txt" },
  { href: paths.mcp(), label: "MCP server" },
  { href: `${REPO}/tree/main/packages/metrics/specs`, label: "Specs on GitHub" },
]

export default function StandardIndex() {
  const published = publishedSpecs()
  const all = allSpecs()
  const drafts = published.filter((s) => !isReviewed(s)).length
  const reviewed = all.filter(isReviewed).length
  const order = new Map(families.map((f, i) => [f, i]))
  const items: IndexItem[] = [...published]
    .sort((a, b) => order.get(a.family)! - order.get(b.family)! || a.name.localeCompare(b.name))
    .map((s) => ({
      id: s.id,
      name: s.name,
      oneLine: s.definition.one_line,
      family: s.family,
      kind: kindLabel(s),
      band: bandAt(s, VOLUME)?.moveLabel ?? null,
      terms: [...s.aliases, ...s.events.map((e) => e.name), ...s.events.flatMap((e) => e.also_called)].join(" "),
      href: paths.metric(s.id),
    }))
  const fams: IndexFamily[] = families.map((f) => ({
    id: f,
    name: familyNames[f],
    inReview: all.filter((s) => s.family === f && !isReviewed(s)).length,
  }))

  return (
    <Page>
      <header className="pt-12 pb-10 sm:pt-16 sm:pb-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Prompt command="standard" flags="--list" />
          {drafts > 0 && <DraftMark />}
        </div>
        <h1 className="mt-6 pixel-79 max-lg:pixel-46">
          The Standard
          <span className="cursor-block" aria-hidden />
        </h1>
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-16">
          <div className="max-w-2xl space-y-4 text-[17px] leading-relaxed text-pretty sm:text-[19px]">
            <p>
              Growth metrics, each defined once: what it counts, the query that computes it in four SQL dialects, how far it moves by chance, and
              what to check when it moves.
            </p>
            <p className="text-muted-foreground">
              It is open source under MIT. Every number on these pages is reproducible from a query you can copy, and a YAML spec on GitHub is the
              source of all of it.
            </p>
          </div>
          <div className="lg:pt-1.5">
            <dl className="grid grid-cols-3 gap-4 border-t border-border pt-4 lg:grid-cols-1 lg:gap-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
              <Stat label="Metrics" value={all.length} />
              <Stat label="Reviewed" value={reviewed} />
              <Stat label="Families" value={families.length} />
            </dl>
          </div>
        </div>
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[12.5px]">
          {machineLinks.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 transition-colors duration-[80ms] hover:text-foreground hover:underline">
                {l.label}
                <ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </header>

      {items.length ? (
        <MetricIndex items={items} families={fams} volume={VOLUME} />
      ) : (
        <InReview written={all.length} />
      )}
    </Page>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="label-mono">{label}</dt>
      <dd className="num mt-1 text-[24px] leading-none">{value}</dd>
    </div>
  )
}

/** Production before the first review: say so plainly, and point at the drafts. */
function InReview({ written }: { written: number }) {
  return (
    <section className="border-t border-border py-16 sm:py-20" aria-labelledby="in-review">
      <div className="grid gap-8 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-12">
        <div className="label-mono lg:pt-2">Status</div>
        <div className="max-w-2xl">
          <Prompt command="standard" flags="--status" className="mb-4" />
          <h2 id="in-review" className="pixel-46 text-balance max-sm:pixel-33">
            The Standard is in review.
          </h2>
          <p className="mt-6 text-[17px] leading-relaxed text-muted-foreground">
            {written > 0 ? `${written} metric specs are written and waiting for sign-off.` : "The metric specs are being written."} Each page publishes the
            day its spec is reviewed, with its query, its noise band and its driver tree. Until then, the drafts are readable on GitHub.
          </p>
          <a
            href={`${REPO}/tree/main/packages/metrics/specs`}
            className="mt-8 inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-card px-4 text-[14px] font-medium transition-colors duration-[80ms] hover:bg-accent"
          >
            Read the draft specs <ArrowUpRight className="size-4" strokeWidth={1.5} />
          </a>
        </div>
      </div>
    </section>
  )
}
