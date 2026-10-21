import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { formatWeekRange, verdict, yearInMondays } from "@workspace/metrics"
import { Button } from "@workspace/ui/components/button"
import { Logo } from "@workspace/ui/brand/logo"
import { Prompt } from "@workspace/ui/brand/prompt"
import { Verdict } from "@workspace/ui/brand/verdict"
import { cn } from "@workspace/ui/lib/utils"
import { LandingPulse } from "@/components/landing-pulse"
import { SiteHeader } from "@/components/site-header"
import { sampleRows } from "@/lib/sample"
import { readWorkspace } from "@/lib/session"

const steps = [
  {
    n: "01",
    title: "Connect PostHog",
    body: "Paste a read-only personal API key. No snippet to install, no warehouse, nothing written back.",
  },
  {
    n: "02",
    title: "Claude maps your events, once",
    body: "It proposes which event is an order, a cart, a checkout, and why. You check it. Then it compiles to fixed queries; no model touches a number after that.",
  },
  {
    n: "03",
    title: "Every Monday, one table and one sentence",
    body: "Each metric against last week, the last four, the quarter and last year. Every move is judged against its own noise: a filled pill means it's real.",
  },
]

export default async function Home() {
  const rows = sampleRows()
  const last = rows.length - 1
  const v = verdict(rows, last)
  const year = yearInMondays(rows, last, 52)
  const moved = year.filter((y) => y.verdict.state !== "flat").length
  const ws = await readWorkspace()

  return (
    <>
      <SiteHeader connected={!!ws} />
      <main>
        <section className="mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-8 sm:pt-28">
          <Prompt command="weekly_read" flags={`--sample northwind --week ${rows[last]!.week}`} className="mb-6" />
          <Verdict verdict={v} size={79} className="max-w-5xl max-md:pixel-46" />
          <p className="mt-8 max-w-2xl text-[19px] leading-relaxed text-muted-foreground">
            Connect PostHog and get one table and one sentence every Monday: what moved your business, and whether it&apos;s real or a
            fluke.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <Button asChild size="lg" className="h-10 px-4 text-[14px]">
              <Link href={ws ? "/app" : "/connect"}>{ws ? "Open your Pulse" : "Connect PostHog"}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-10 px-4 text-[14px]">
              <Link href="/demo">Open the sample workspace</Link>
            </Button>
          </div>
          <p className="mt-5 font-mono text-[12px] text-muted-foreground">Free and open source · read-only · MIT</p>
        </section>

        <section className="mx-auto max-w-6xl px-4 sm:px-8">
          <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Prompt command="weekly_read" flags="--compare wow,4wk,qtr,yoy" />
              <span className="font-mono text-[12px] text-muted-foreground">Northwind Goods · {formatWeekRange(rows[last]!.week)}</span>
            </div>
            <LandingPulse rows={rows} />
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-24 sm:px-8 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n}>
              <div className="label-mono">{s.n}</div>
              <h2 className="mt-3 text-[17px] font-medium">{s.title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </section>

        <section className="border-y border-border bg-card">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-center">
            <div>
              <Prompt command="year_in_mondays" flags="--weeks 52" className="mb-4" />
              <h2 className="pixel-46 text-balance max-sm:pixel-33">A year of Mondays, the moment you connect.</h2>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                wowyoy reads your history on day one and writes every past week&apos;s headline, so you can see which weeks really moved
                before your first Monday arrives.
              </p>
            </div>
            <div>
              <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${year.length}, minmax(0, 1fr))` }} aria-hidden>
                {year.map((y) => (
                  <span
                    key={y.week}
                    className={cn("h-10 rounded-[3px]", y.verdict.state === "up" ? "bg-up" : y.verdict.state === "down" ? "bg-down" : "bg-band")}
                  />
                ))}
              </div>
              <p className="mt-3 font-mono text-[12px] text-muted-foreground">
                Northwind&apos;s last 52 Mondays · {moved} with a move beyond noise
              </p>
              <Link href="/demo?view=year" className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium underline-offset-4 hover:underline">
                Read them <ArrowRight className="size-3.5" strokeWidth={1.5} />
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-24 sm:px-8">
          <Link href="/fluke" className="group block rounded-xl border border-border bg-card p-8 transition-colors duration-[80ms] hover:bg-accent sm:p-10">
            <Prompt command="fluke_test" flags="--free" className="mb-4" />
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <h2 className="pixel-46 max-sm:pixel-33">Is this a fluke?</h2>
                <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                  Paste any weekly number with its history. Get a straight answer, with the noise of both weeks counted, and a link to
                  share it.
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-[14px] font-medium">
                Try the Fluke Test <ArrowRight className="size-4 transition-transform duration-[160ms] group-hover:translate-x-0.5" strokeWidth={1.5} />
              </span>
            </div>
          </Link>
        </section>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 font-mono text-[12px] text-muted-foreground sm:px-8">
          <Logo className="text-[16px]" cursor={false} />
          <div className="flex gap-5">
            <Link href="/fluke" className="hover:text-foreground">
              Fluke Test
            </Link>
            <Link href="/demo" className="hover:text-foreground">
              Sample
            </Link>
            <a href="https://github.com/1aday/wowyoy" className="hover:text-foreground">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </>
  )
}
