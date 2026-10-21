import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { absolute, parseWhySlug, paths, robotsMeta, whyPages, whySteps, type WhyDirection } from "@workspace/compiler"
import { formatWeekRange, isReviewed, latestClosedWeek, publishedSpecs, type MetricSpec } from "@workspace/metrics"
import { Prompt } from "@workspace/ui/brand/prompt"
import { FlukeEmbed } from "@/components/fluke/fluke-embed"
import { BandExplorer } from "@/components/standard/band-explorer"
import { DraftMark } from "@/components/standard/draft-mark"
import { ConnectCta } from "@/components/standard/get-this-as"
import { Page } from "@/components/standard/page-section"
import { BusinessSteps } from "@/components/why/business-steps"
import { WhyStep } from "@/components/why/why-step"
import { WorldEvents } from "@/components/why/world-events"
import { bandModel } from "@/lib/standard/band-model"
import { jsonLdHtml, whyJsonLd } from "@/lib/standard/jsonld"
import { lowerName, numberWord, processSwing, whyQuestion } from "@/lib/standard/spec-view"
import { pullWorld, worldFeeds } from "@/lib/standard/world"

type Params = Promise<{ slug: string }>

/**
 * Step 2 reads this week's outside events, so the page is rebuilt at most once a day. Pages render
 * on first visit rather than at build, so a slow source never holds up a deploy; unknown slugs 404.
 */
export const revalidate = 86400
export const dynamicParams = true

export function generateStaticParams() {
  return []
}

function find(slug: string): { spec: MetricSpec; direction: WhyDirection } | null {
  const parsed = parseWhySlug(slug)
  if (!parsed) return null
  const page = whyPages(publishedSpecs()).find((p) => p.spec.id === parsed.id && p.direction === parsed.direction)
  return page ? { spec: page.spec, direction: page.direction } : null
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = find((await params).slug)
  if (!found) return {}
  const { spec, direction } = found
  const path = paths.why(spec.id, direction)
  const title = whyQuestion(spec, direction)
  const description = `Three checks, in order: whether the move is noise, whether something outside moved it this week, and which of ${spec.drivers.length} drivers changed. Each with its query.`
  return {
    title,
    description,
    alternates: { canonical: absolute(path) },
    robots: robotsMeta({ kind: "why", path, spec }),
    openGraph: { title, description, url: absolute(path), type: "article", siteName: "wowyoy" },
    twitter: { card: "summary", title, description },
  }
}

export default async function WhyPage({ params }: { params: Params }) {
  const found = find((await params).slug)
  if (!found) notFound()
  const { spec, direction } = found
  const published = publishedSpecs()
  const steps = whySteps(spec, direction, published)
  const week = latestClosedWeek()
  const world = await pullWorld(week, worldFeeds(spec, steps.world.feeds))
  const band = bandModel(spec)
  const other: WhyDirection = direction === "dropped" ? "spiked" : "dropped"
  const name = lowerName(spec.name)
  const verb = direction === "dropped" ? "drop" : "rise"

  const ld = whyJsonLd(spec, direction, [
    { name: "Chance", text: `Check the ${verb} against ${name}'s noise band. Inside the band, there is nothing to explain.` },
    { name: "The world", text: `Check this week's outside events from the sources that can move ${name}.` },
    { name: "Your business", text: steps.business.map((s) => s.check).join(" ") },
  ])

  return (
    <Page>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(ld)} />
      <header className="pt-12 pb-14 sm:pt-16 sm:pb-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Prompt command="why" flags={`--metric ${spec.id} --${direction}`} />
          {!isReviewed(spec) && <DraftMark />}
        </div>
        <h1 className="mt-6 max-w-5xl pixel-79 text-balance max-lg:pixel-46 max-sm:pixel-33">
          {whyQuestion(spec, direction)}
          <span className="cursor-block" aria-hidden />
        </h1>
        <p className="mt-6 max-w-2xl text-[19px] leading-relaxed text-pretty sm:text-[21px]">
          Three checks, always in this order. Stop at the first one that explains the {verb}.
        </p>
        <ol className="mt-8 flex flex-wrap gap-x-8 gap-y-2 font-mono text-[12.5px] text-muted-foreground">
          {[
            ["chance", "1 Chance"],
            ["world", "2 The world"],
            ["business", `3 Your business · ${steps.business.length} checks`],
          ].map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="underline-offset-4 transition-colors duration-[80ms] hover:text-foreground hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ol>
      </header>

      <ol className="border-t border-border pt-12 sm:pt-16">
        <WhyStep
          n={1}
          id="chance"
          label="Chance"
          title={`Is the ${verb} bigger than noise?`}
          lead={
            <>
              Most weekly moves are chance. Read this one against {name}&apos;s noise band before looking for a cause.
            </>
          }
        >
          {band ? (
            <BandExplorer model={band} compact />
          ) : (
            <ProcessNote spec={spec} />
          )}
          <p className="mt-8 max-w-2xl border-l-2 border-foreground pl-4 text-[15px] leading-relaxed">
            If the {verb} is inside the band, the page stops here: nothing happened that needs a reason. Look again next Monday.
          </p>
          <div className="mt-10 empty:hidden">
            <FlukeEmbed spec={spec} direction={direction} />
          </div>
        </WhyStep>

        <WhyStep
          n={2}
          id="world"
          label="The world"
          title="Did something outside move it?"
          lead={
            <>
              Outside events in the week of <span className="text-foreground">{formatWeekRange(week.monday)}</span> ({week.id}), from the sources that can
              move {name}. Read again every day.
            </>
          }
        >
          <WorldEvents results={world} />
        </WhyStep>

        <WhyStep
          n={3}
          id="business"
          label="Your business"
          title={`${numberWord(steps.business.length)} checks, in the order an operator runs them.`}
          lead={<>Each check says what a yes looks like and gives the query that answers it. The first yes is usually the cause.</>}
          last
        >
          <BusinessSteps spec={spec} steps={steps.business} />
        </WhyStep>
      </ol>

      <nav aria-label="Related pages" className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
        <Link href={paths.metric(spec.id)} className="group flex flex-col gap-1.5 bg-card p-5 transition-colors duration-[80ms] hover:bg-accent sm:p-6">
          <span className="label-mono">The metric</span>
          <span className="inline-flex items-center gap-1.5 text-[15.5px] font-medium">
            <ArrowLeft className="size-3.5 shrink-0 transition-transform duration-[160ms] group-hover:-translate-x-0.5" strokeWidth={1.5} />
            {spec.name}: definition, query and normal range
          </span>
        </Link>
        <Link href={paths.why(spec.id, other)} className="group flex flex-col gap-1.5 bg-card p-5 transition-colors duration-[80ms] hover:bg-accent sm:items-end sm:p-6 sm:text-right">
          <span className="label-mono">The other direction</span>
          <span className="inline-flex items-center gap-1.5 text-[15.5px] font-medium">
            {whyQuestion(spec, other)}
            <ArrowRight className="size-3.5 shrink-0 transition-transform duration-[160ms] group-hover:translate-x-0.5" strokeWidth={1.5} />
          </span>
        </Link>
      </nav>

      <div className="mt-14">
        <ConnectCta flags="--all-metrics --every monday" />
      </div>
    </Page>
  )
}

function ProcessNote({ spec }: { spec: MetricSpec }) {
  const swing = processSwing(spec)
  return (
    <p className="max-w-3xl text-[19px] leading-snug tracking-[-0.01em] text-balance sm:text-[21px]">
      {spec.name} has no sampling noise: it is judged against its own weeks.
      {swing && (
        <>
          {" "}
          In the example data, a normal week moves up to <span className="num">±{(swing.relative * 100).toFixed(swing.relative < 0.1 ? 1 : 0)}%</span>.
        </>
      )}
    </p>
  )
}
