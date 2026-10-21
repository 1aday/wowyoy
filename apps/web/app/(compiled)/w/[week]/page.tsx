import type { Metadata } from "next"
import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"
import { cache } from "react"
import { ArrowRight } from "lucide-react"
import { paths, robotsMeta } from "@workspace/compiler"
import { latestClosedWeek, parseWeekId, type IsoWeek } from "@workspace/metrics"
import { Prompt } from "@workspace/ui/brand/prompt"
import { SourcesList } from "@/components/ledger/week-sections"
import { WeekBody, WeekNav } from "@/components/ledger/week-view"
import { WeekKeys } from "@/components/ledger/week-keys"
import { neighbours, weekState } from "@/lib/ledger/archive"
import { closedAt, weekRange } from "@/lib/ledger/format"
import { ledgerWeek, repoRows } from "@/lib/ledger/week"

/** Closed weeks render on first visit and stay cached; the week-close and feeds crons refresh what changes. */
export const revalidate = 86400

export function generateStaticParams() {
  return []
}

type Params = Promise<{ week: string }>

const resolve = cache(async (raw: string) => {
  const week = parseWeekId(raw)
  if (!week) return null
  const state = weekState(week)
  if (state === "before-archive" || state === "future") return null
  return { week, state, ledger: state === "closed" ? await ledgerWeek(week) : null }
})

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const r = await resolve((await params).week)
  if (!r) return {}
  const path = paths.week(r.week.id)
  if (!r.ledger) return { title: `Week ${r.week.week} closes Monday`, robots: robotsMeta({ kind: "week", path, closed: false }) }
  const description = `${weekRange(r.week)}. The calendar and the outside events that can move a weekly number, from eight public feeds.`
  return {
    title: r.ledger.title,
    description,
    alternates: { canonical: path, types: { "text/markdown": paths.weekFile(r.week.id), "application/rss+xml": "/w/rss.xml" } },
    robots: robotsMeta({ kind: "week", path, closed: true }),
    openGraph: { type: "article", title: r.ledger.title, description, url: path },
    twitter: { card: "summary_large_image", title: r.ledger.title, description },
  }
}

function OpenWeek({ week }: { week: IsoWeek }) {
  const latest = latestClosedWeek()
  return (
    <main className="mx-auto max-w-6xl px-4 pt-12 pb-24 sm:px-8">
      <Prompt command="monday_ledger" flags={`--week ${week.id}`} className="mb-8" />
      <div className="label-mono">
        Week {week.week} · {weekRange(week)}
      </div>
      <h1 className="pixel-46 mt-4 max-w-4xl text-balance max-sm:pixel-33">
        Week {week.week} closes Monday at 06:00 UTC.
        <span className="cursor-block" aria-hidden />
      </h1>
      <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
        The ledger writes each week once, from closed weeks only, so nothing on it changes after the fact. This one closes {closedAt(week)}.
      </p>
      <Link href={paths.week(latest.id)} className="mt-8 inline-flex items-center gap-1 text-[15px] font-medium underline-offset-4 hover:underline">
        Read week {latest.week} <ArrowRight className="size-4" strokeWidth={1.5} />
      </Link>
    </main>
  )
}

export default async function WeekPage({ params }: { params: Params }) {
  const raw = (await params).week
  const r = await resolve(raw)
  if (!r) notFound()
  if (raw !== r.week.id) permanentRedirect(paths.week(r.week.id))
  if (!r.ledger) return <OpenWeek week={r.week} />

  const { week, ledger } = r
  const { prev, next } = neighbours(week)
  const repos = await repoRows(week)
  return (
    <main className="mx-auto max-w-6xl px-4 pt-12 pb-24 sm:px-8">
      <WeekKeys prev={prev && paths.week(prev.id)} next={next && paths.week(next.id)} />
      <div className="mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <Prompt command="monday_ledger" flags={`--week ${week.id}`} />
        <WeekNav prev={prev} next={next} className="-mr-2" />
      </div>
      <div className="label-mono">
        Week {week.week} · {weekRange(week)}
      </div>
      <h1 className="pixel-46 mt-4 max-w-5xl text-balance max-sm:pixel-33">{ledger.headline}</h1>
      <p className="mt-5 font-mono text-[12.5px] text-muted-foreground">
        Closed {closedAt(week)} · {ledger.feeds.filter((f) => f.status === "ok").length} of {ledger.feeds.length} feeds answered
      </p>

      <div className="mt-12">
        <WeekBody ledger={ledger} repos={repos} />
        <section className="grid gap-x-10 gap-y-3 border-t border-border py-8 lg:grid-cols-[11rem_minmax(0,1fr)]" aria-labelledby="sources-label">
          <h2 id="sources-label" className="label-mono">
            Sources
          </h2>
          <div className="min-w-0">
            <SourcesList feeds={ledger.feeds} />
            <p className="mt-5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
              Every row comes from these feeds, placed by fixed rules; no model writes this page.
            </p>
            <p className="mt-3 font-mono text-[12.5px] text-muted-foreground">
              <a href={paths.weekFile(week.id)} className="hover:text-foreground">
                {week.id}.md
              </a>
              <span aria-hidden> · </span>
              <a href="/w/rss.xml" className="hover:text-foreground">
                RSS
              </a>
              <span aria-hidden> · </span>
              <Link href={paths.ledger()} className="hover:text-foreground">
                All weeks
              </Link>
            </p>
          </div>
        </section>
      </div>
      <WeekNav prev={prev} next={next} className="mt-4 flex justify-center border-t border-border pt-6" />
    </main>
  )
}
