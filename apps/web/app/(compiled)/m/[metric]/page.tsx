import type { Metadata } from "next"
import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { absolute, emitAll, paths, robotsMeta } from "@workspace/compiler"
import { familyNames, formatWeek, isReviewed, publishedSpecs, type MetricSpec } from "@workspace/metrics"
import { Prompt } from "@workspace/ui/brand/prompt"
import { FlukeEmbed } from "@/components/fluke/fluke-embed"
import { BandExplorer } from "@/components/standard/band-explorer"
import { DraftMark } from "@/components/standard/draft-mark"
import { DriverTree } from "@/components/standard/driver-tree"
import { EventList, Formula } from "@/components/standard/formula"
import { ConnectCta, GetThisAs } from "@/components/standard/get-this-as"
import { Move } from "@/components/standard/move"
import { Page, PageSection } from "@/components/standard/page-section"
import { QueryTabs } from "@/components/standard/query-tabs"
import { SpecTrendChart } from "@/components/standard/spec-trend-chart"
import { bandModel } from "@/lib/standard/band-model"
import { formatSpecValue } from "@/lib/standard/format"
import { jsonLdHtml, metricJsonLd } from "@/lib/standard/jsonld"
import { queryNotes, resolveMetric, treeDrivers, whyLinks } from "@/lib/standard/pages"
import { businessName, kindLabel, lowerName, noiseLabel, noiseSentence, numberWord, processSwing, trendView, whyQuestion } from "@/lib/standard/spec-view"

type Params = Promise<{ metric: string }>

/** Aliases and other spellings aren't prerendered: they resolve at request time to a permanent redirect. */
export const dynamicParams = true

export function generateStaticParams() {
  return publishedSpecs().map((s) => ({ metric: s.id }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const r = resolveMetric((await params).metric)
  if (!r || !("spec" in r)) return {}
  const { spec } = r
  const path = paths.metric(spec.id)
  const title = `${spec.name}: definition, query and normal range`
  const description = spec.definition.one_line
  return {
    title,
    description,
    alternates: { canonical: absolute(path) },
    robots: robotsMeta({ kind: "metric", path, spec }),
    openGraph: { title, description, url: absolute(path), type: "article", siteName: "wowyoy" },
    twitter: { card: "summary", title, description },
  }
}

export default async function MetricPage({ params }: { params: Params }) {
  const r = resolveMetric((await params).metric)
  if (!r) notFound()
  if ("redirect" in r) permanentRedirect(r.redirect)
  const { spec } = r
  const published = publishedSpecs()
  const queries = emitAll(spec)
  const band = bandModel(spec)
  const trend = trendView(spec, 26)
  const drivers = treeDrivers(spec, published)
  const why = whyLinks(spec, published)
  const related = spec.related.flatMap((id) => published.filter((s) => s.id === id))

  return (
    <Page>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(metricJsonLd(spec))} />
      <header className="pt-12 pb-12 sm:pt-16 sm:pb-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Prompt command="define" flags={`--metric ${spec.id}`} />
          {!isReviewed(spec) && <DraftMark />}
        </div>
        <h1 className="mt-6 pixel-79 text-balance max-lg:pixel-46 max-sm:pixel-33">
          {spec.name}
          <span className="cursor-block" aria-hidden />
        </h1>
        <p className="mt-6 max-w-3xl text-[19px] leading-relaxed text-pretty sm:text-[21px]">{spec.definition.one_line}</p>
        {spec.aliases.length > 0 && (
          <p className="mt-3 max-w-3xl text-[14.5px] leading-relaxed text-muted-foreground">Also called {spec.aliases.join(", ")}.</p>
        )}
        <Facts spec={spec} />
        <GetThisAs id={spec.id} query={queries.hogql} className="mt-8" />
      </header>

      <PageSection id="formula" label="Formula" note={spec.queries ? "What the hand-written query reads." : "Compiled from the spec's measures. Every query below is built from these."} title={spec.definition.formula}>
        <Formula spec={spec} />
        <div className="label-mono mt-10 mb-3">Canonical events</div>
        <EventList events={spec.events} />
      </PageSection>

      <PageSection
        id="query"
        label="Query"
        note="One row per complete ISO week, Monday to Sunday, UTC."
        title={`The last 26 weeks of ${lowerName(spec.name)}, one row a week.`}
      >
        <QueryTabs queries={queries} notes={queryNotes(!!spec.queries)} label={`${spec.name} query`} />
      </PageSection>

      <PageSection id="normal-range" label="Normal range" note={noiseSentence[spec.noise.type]}>
        {band ? <BandExplorer model={band} /> : <ProcessRange spec={spec} />}
      </PageSection>

      <PageSection
        id="example"
        label="Example"
        note={`Fictional data for ${businessName(spec).name}, ${businessName(spec).what}. Never a real customer.`}
        title={<ExampleTitle spec={spec} trend={trend} />}
      >
        {trend.verdict && <p className="-mt-2 mb-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{trend.verdict.reason}</p>}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <div className="label-mono mb-4">Example data · {businessName(spec).name}</div>
          <SpecTrendChart spec={spec} points={trend.points} real={trend.verdict?.call === "real"} name={spec.name} />
        </div>
      </PageSection>

      <div className="border-t border-border py-12 empty:hidden sm:py-16">
        <FlukeEmbed spec={spec} />
      </div>

      {drivers.length > 0 && (
        <PageSection
          id="drivers"
          label="Drivers"
          note="Hover or focus a driver to read its check. Each links to its own page when it has one."
          title={`${numberWord(drivers.length)} thing${drivers.length === 1 ? "" : "s"} move${drivers.length === 1 ? "s" : ""} it. Check ${drivers.length === 1 ? "it" : "them in this order"}.`}
        >
          <DriverTree root={spec.name} drivers={drivers} />
          {why && (
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-[14px]">
              {(["dropped", "spiked"] as const).map((d) => (
                <Link key={d} href={why[d]} className="group inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline">
                  {whyQuestion(spec, d)}
                  <ArrowRight className="size-3.5 transition-transform duration-[160ms] group-hover:translate-x-0.5" strokeWidth={1.5} />
                </Link>
              ))}
            </div>
          )}
        </PageSection>
      )}

      <PageSection id="why-it-matters" label="Why it matters">
        <p className="max-w-3xl text-[17px] leading-[1.7] text-pretty sm:text-[19px]">{spec.prose.why_it_matters}</p>
      </PageSection>

      <PageSection id="pitfalls" label="Pitfalls" note="The ways this number is most often measured or read wrong.">
        <ol className="max-w-3xl divide-y divide-border border-y border-border">
          {spec.prose.pitfalls.map((p, i) => (
            <li key={i} className="grid grid-cols-[2rem_minmax(0,1fr)] py-4 text-[15.5px] leading-relaxed">
              <span className="num pt-[3px] text-[12px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
      </PageSection>

      {related.length > 0 && (
        <PageSection id="related" label="Related">
          <ul className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
            {related.map((s) => (
              <li key={s.id} className="bg-card">
                <Link href={paths.metric(s.id)} className="group flex h-full flex-col gap-1.5 p-5 transition-colors duration-[80ms] hover:bg-accent">
                  <span className="flex items-center justify-between gap-3 text-[15px] font-medium">
                    {s.name}
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-[160ms] group-hover:translate-x-0.5" strokeWidth={1.5} />
                  </span>
                  <span className="text-[13.5px] leading-relaxed text-muted-foreground">{s.definition.one_line}</span>
                </Link>
              </li>
            ))}
          </ul>
        </PageSection>
      )}

      <ConnectCta flags={`--metric ${spec.id} --every monday`} />
    </Page>
  )
}

function Facts({ spec }: { spec: MetricSpec }) {
  const facts: [string, React.ReactNode][] = [
    ["Family", <Link key="f" href={`${paths.standard()}#${spec.family}`} className="underline-offset-4 hover:underline">{familyNames[spec.family]}</Link>],
    ["Kind", kindLabel(spec)],
    ["Better when", spec.polarity === "up-is-good" ? "Higher" : "Lower"],
    ["Noise model", noiseLabel[spec.noise.type]],
    ["Version", <span key="v" className="num">v{spec.version}</span>],
  ]
  return (
    <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-border pt-6 sm:flex sm:flex-wrap sm:gap-x-12">
      {facts.map(([k, v]) => (
        // Two to a row on phones, where the version would sit alone: it is left out there.
        <div key={k} className={k === "Version" ? "min-w-0 max-sm:hidden" : "min-w-0"}>
          <dt className="label-mono">{k}</dt>
          <dd className="mt-1.5 text-[14.5px]">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function ExampleTitle({ spec, trend }: { spec: MetricSpec; trend: ReturnType<typeof trendView> }) {
  const last = trend.points.at(-1)
  const v = trend.verdict
  if (!last) return null
  return (
    <>
      Week of {formatWeek(last.week)}: <span className="num">{formatSpecValue(spec, last.value)}</span>
      {v && (
        <>
          ,{" "}
          <Move kind={spec.kind} change={spec.kind === "rate" ? v.change : v.relativeChange} real={v.call === "real"} className="align-[0.08em] text-[0.8em]" />
          {". "}
          {v.headline}
        </>
      )}
    </>
  )
}

function ProcessRange({ spec }: { spec: MetricSpec }) {
  const swing = processSwing(spec)
  return (
    <div className="max-w-3xl">
      <p className="text-[21px] leading-snug tracking-[-0.01em] text-balance sm:text-[24px]">
        No volume makes {lowerName(spec.name)} noisy. Its own weeks set the band.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
        A week is judged against the metric&apos;s own week-to-week movement over the last 26 weeks (XmR limits, as in the Fluke Test), not against a
        sampling floor.
        {swing && (
          <>
            {" "}
            In the example data, a normal week moves up to{" "}
            <span className="num text-foreground">±{(swing.relative * 100).toFixed(swing.relative < 0.1 ? 1 : 0)}%</span> on the week before.
          </>
        )}
      </p>
    </div>
  )
}
