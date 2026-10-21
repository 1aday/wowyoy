import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { paths, robotsMeta } from "@workspace/compiler"
import { Prompt } from "@workspace/ui/brand/prompt"
import { WeekBody } from "@/components/ledger/week-view"
import { archiveWeeks } from "@/lib/ledger/archive"
import { weekRange } from "@/lib/ledger/format"
import { ledgerWeeks, repoRows } from "@/lib/ledger/week"

export const revalidate = 3600

const description = "One page per closed ISO week: the calendar and the outside events that can move a weekly number, written by rule from eight public feeds."

export const metadata: Metadata = {
  title: "Monday Ledger",
  description,
  alternates: { canonical: paths.ledger(), types: { "application/rss+xml": "/w/rss.xml" } },
  robots: robotsMeta({ kind: "fixed", path: paths.ledger() }),
  openGraph: { title: "Monday Ledger", description, url: paths.ledger() },
}

export default async function LedgerIndex() {
  const weeks = await ledgerWeeks(archiveWeeks())
  const latest = weeks[0]!
  const repos = await repoRows(latest.week)
  const years = [...new Set(weeks.map((l) => l.week.year))]

  return (
    <main className="mx-auto max-w-6xl px-4 pt-12 pb-24 sm:px-8">
      <Prompt command="monday_ledger" flags="--archive" className="mb-8" />
      <h1>
        <span className="label-mono block">
          Monday Ledger · Week {latest.week.week} · {weekRange(latest.week)}
        </span>
        <Link href={paths.week(latest.week.id)} className="pixel-46 mt-4 block max-w-5xl text-balance decoration-2 underline-offset-[6px] hover:underline max-sm:pixel-33">
          {latest.headline}
        </Link>
      </h1>
      <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        {description} Each week closes Monday at 06:00 UTC and doesn&apos;t change after.{" "}
        <a href="/w/rss.xml" className="text-foreground underline decoration-border underline-offset-[3px] hover:decoration-foreground">
          RSS
        </a>
      </p>

      <div className="mt-12">
        <WeekBody ledger={latest} repos={repos} />
        <div className="border-t border-border py-6 lg:pl-[calc(11rem+2.5rem)]">
          <Link href={paths.week(latest.week.id)} className="inline-flex items-center gap-1 text-[15px] font-medium underline-offset-4 hover:underline">
            Open week {latest.week.week} <ArrowRight className="size-4" strokeWidth={1.5} />
          </Link>
        </div>
      </div>

      <section aria-labelledby="archive-label" className="mt-16">
        <div className="flex items-baseline justify-between border-b border-border pb-3">
          <h2 id="archive-label" className="label-mono text-foreground">
            Archive
          </h2>
          <span className="num text-[12px] text-muted-foreground">{weeks.length} weeks</span>
        </div>
        <table className="w-full text-[15px]">
          <thead className="sr-only">
            <tr>
              <th>Week</th>
              <th>Dates</th>
              <th>Headline</th>
            </tr>
          </thead>
          {years.map((year) => (
            <tbody key={year}>
              <tr>
                <th colSpan={3} scope="colgroup" className="label-mono pt-6 pb-2 text-left">
                  {year}
                </th>
              </tr>
              {weeks
                .filter((l) => l.week.year === year)
                .map((l) => (
                  <tr key={l.week.id} className="group border-b border-border/70 max-sm:grid max-sm:grid-cols-[4.5rem_minmax(0,1fr)] max-sm:gap-x-3 max-sm:py-3">
                    <td className="num w-24 py-3 align-top text-[13px] text-muted-foreground max-sm:w-auto max-sm:py-0 max-sm:pt-[3px]">
                      <Link href={paths.week(l.week.id)} className="hover:text-foreground" tabIndex={-1}>
                        W{String(l.week.week).padStart(2, "0")}
                      </Link>
                    </td>
                    <td className="num w-44 py-3 align-top text-[13px] whitespace-nowrap text-muted-foreground max-sm:hidden">{weekRange(l.week).replace(/, \d{4}$/, "")}</td>
                    <td className="py-3 align-top max-sm:p-0">
                      <Link href={paths.week(l.week.id)} className="decoration-border underline-offset-[3px] group-hover:underline">
                        {l.headline}
                      </Link>
                      <div className="num mt-1 text-[12px] text-muted-foreground sm:hidden">{weekRange(l.week)}</div>
                    </td>
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </section>
    </main>
  )
}
