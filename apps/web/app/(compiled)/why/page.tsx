import type { Metadata } from "next"
import Link from "next/link"
import { absolute, hasWhy, paths, robotsMeta, whyPages } from "@workspace/compiler"
import { DOWN, UP, allSpecs, families, familyNames, isReviewed, publishedSpecs } from "@workspace/metrics"
import { Prompt } from "@workspace/ui/brand/prompt"
import { DraftMark } from "@/components/standard/draft-mark"
import { Page } from "@/components/standard/page-section"
import { whyQuestion } from "@/lib/standard/spec-view"

const title = "Why did it move? Three checks for any growth metric"
const description =
  "When a weekly number drops or spikes: check it against its noise, check this week's outside events, then walk its drivers in order, each with a query."

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: absolute(paths.whyIndex()) },
  robots: robotsMeta({ kind: "fixed", path: paths.whyIndex() }),
  openGraph: { title, description, url: absolute(paths.whyIndex()), siteName: "wowyoy" },
}

const steps = [
  { n: "1", title: "Chance", body: "Is the move bigger than the noise at your volume? Most weeks it isn't, and the answer stops there." },
  { n: "2", title: "The world", body: "Did something outside move it this week: a payment outage, a search update, a holiday?" },
  { n: "3", title: "Your business", body: "Walk the metric's drivers in the order an operator checks them, each with the query that answers it." },
]

export default function WhyIndex() {
  const pages = whyPages(publishedSpecs())
  const specs = [...new Map(pages.map((p) => [p.spec.id, p.spec])).values()]
  const drafts = specs.some((s) => !isReviewed(s))
  const waiting = allSpecs().filter((s) => hasWhy(s) && !isReviewed(s)).length

  return (
    <Page>
      <header className="pt-12 pb-12 sm:pt-16 sm:pb-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Prompt command="why" flags="--list" />
          {drafts && <DraftMark />}
        </div>
        <h1 className="mt-6 pixel-79 max-lg:pixel-46">
          Why did it move?
          <span className="cursor-block" aria-hidden />
        </h1>
        <p className="mt-6 max-w-2xl text-[19px] leading-relaxed text-pretty sm:text-[21px]">
          One page for every metric and direction. Three checks, always in this order, compiled from the metric&apos;s spec.
        </p>
        <ol className="mt-12 grid gap-8 border-t border-border pt-8 md:grid-cols-3 md:gap-10">
          {steps.map((s) => (
            <li key={s.n}>
              <div className="flex items-center gap-3">
                <span className="num grid size-7 place-items-center rounded-full border border-foreground text-[13px]">{s.n}</span>
                <span className="text-[16px] font-medium">{s.title}</span>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </header>

      {specs.length ? (
        families.map((f) => {
          const inFamily = specs.filter((s) => s.family === f).sort((a, b) => a.name.localeCompare(b.name))
          if (!inFamily.length) return null
          return (
            <section key={f} id={f} aria-labelledby={`${f}-h`} className="scroll-mt-20 pb-12">
              <div className="flex items-baseline justify-between gap-4 border-b border-foreground pb-3">
                <h2 id={`${f}-h`} className="text-[19px] tracking-[-0.01em]">
                  {familyNames[f]}
                </h2>
                <span className="num text-[12px] text-muted-foreground">{inFamily.length * 2} pages</span>
              </div>
              <ul>
                {inFamily.map((s) => (
                  <li key={s.id} className="grid gap-x-6 gap-y-1 border-b border-border py-3.5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,1fr)]">
                    <Link href={paths.metric(s.id)} className="text-[15px] font-medium underline-offset-4 hover:underline">
                      {s.name}
                    </Link>
                    {(["dropped", "spiked"] as const).map((d) => (
                      <Link key={d} href={paths.why(s.id, d)} className="group inline-flex items-baseline gap-2 text-[14.5px] text-muted-foreground transition-colors duration-[80ms] hover:text-foreground">
                        <span className={d === "dropped" ? "text-down" : "text-up"} aria-hidden>
                          <span className="text-[0.72em]">{d === "dropped" ? DOWN : UP}</span>
                        </span>
                        <span className="underline-offset-4 group-hover:underline">{whyQuestion(s, d)}</span>
                      </Link>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      ) : (
        <section className="border-t border-border py-16" aria-labelledby="why-review">
          <Prompt command="why" flags="--status" className="mb-4" />
          <h2 id="why-review" className="pixel-46 text-balance max-sm:pixel-33">
            Why pages publish with their metrics.
          </h2>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
            {waiting > 0 ? `${waiting} metrics have their checks written and are waiting for review.` : "The metric specs are still being written."} A metric&apos;s two
            Why pages go live the day its spec is signed off. Until then, the{" "}
            <Link href="/fluke" className="text-foreground underline underline-offset-4">
              Fluke Test
            </Link>{" "}
            answers the first question for any number.
          </p>
        </section>
      )}
    </Page>
  )
}
