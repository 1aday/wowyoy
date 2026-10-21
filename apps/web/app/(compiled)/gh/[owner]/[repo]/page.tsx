import type { Metadata } from "next"
import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"
import { ArrowUpRight } from "lucide-react"
import { SITE_URL, robotsMeta } from "@workspace/compiler"
import { formatCompact, formatWeekRange } from "@workspace/metrics"
import { headlineText, latestCalls, realMoves, repoHeadline, whyText } from "@workspace/feeds/github/read"
import { measureInfo } from "@workspace/feeds/github/types"
import { Prompt } from "@workspace/ui/brand/prompt"
import { BadgeCard } from "@/components/gh/badge-card"
import { RepoHeadline } from "@/components/gh/repo-move"
import { RepoPulseView } from "@/components/gh/repo-pulse"
import { RepoOptedOut, RepoUnavailable } from "@/components/gh/states"
import { getRepoPulse, retrySoon } from "@/lib/gh/data"
import { canonicalPath, repoView } from "@/lib/gh/view"

/** Rendered on first request, then cached for an hour (ISR); the build never calls GitHub. */
export const revalidate = 3600
export const dynamicParams = true

export async function generateStaticParams() {
  return []
}

type Params = Promise<{ owner: string; repo: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { owner, repo } = await params
  const res = await getRepoPulse(owner, repo)
  if (res.status !== "ok") {
    return { title: res.status === "not-found" ? "Repo not found" : `${owner}/${repo}`, robots: { index: false, follow: true } }
  }
  const { fullName } = res.pulse.repo
  const path = canonicalPath(fullName)
  const title = `${fullName}: Repo Pulse`
  const description = `${headlineText(repoHeadline(res.pulse))} Stars, forks, issues and merged PRs for ${fullName} by ISO week, each judged real or noise.`
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: robotsMeta({ kind: "repo", path, closed: true }),
    openGraph: { title, description, url: path, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  }
}

const n = (x: number) => (x < 10000 ? x.toLocaleString("en-US") : formatCompact(x))

export default async function RepoPage({ params }: { params: Params }) {
  const { owner, repo } = await params
  const res = await getRepoPulse(owner, repo)
  if (res.status === "not-found") notFound()
  if (res.status === "opted-out") return <RepoOptedOut fullName={res.fullName} />
  if (res.status === "unavailable") {
    await retrySoon()
    return <RepoUnavailable fullName={`${owner}/${repo}`} resetAt={res.resetAt} />
  }

  const { pulse } = res
  const path = canonicalPath(pulse.repo.fullName)
  if (path !== `/gh/${owner}/${repo}`) permanentRedirect(path)

  const view = repoView(pulse)
  const week = pulse.weeks[pulse.closed - 1]!
  const top = realMoves(latestCalls(pulse))[0]
  const search = (q: string) => `${pulse.repo.htmlUrl}/issues?q=${encodeURIComponent(q)}`
  const range = `${week.monday}..${week.sunday}`

  return (
    <main className="mx-auto max-w-6xl px-4 pt-12 pb-24 sm:px-8">
      <Prompt command="repo_pulse" flags={`${path.slice(4)} --weeks 26`} className="mb-4 truncate" />
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12.5px] text-muted-foreground">
        <a href={pulse.repo.htmlUrl} className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline" rel="noopener">
          {pulse.repo.fullName}
          <ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden />
        </a>
        {pulse.repo.language && <span>{pulse.repo.language}</span>}
        <span>{n(pulse.repo.stars)} stars</span>
        <span>{n(pulse.repo.forks)} forks</span>
        {pulse.repo.archived && <span className="rounded-full border border-border px-2 py-px">archived</span>}
      </div>

      <RepoHeadline parts={view.headline} className="max-w-5xl" />
      <p className="mt-5 max-w-3xl text-[17px] leading-relaxed text-muted-foreground">
        Week {week.id.slice(6)}, {formatWeekRange(week.monday)}, closed Monday 06:00 UTC.{" "}
        {top
          ? `${measureInfo[top.measure].name}: ${whyText(top.verdict).charAt(0).toLowerCase()}${whyText(top.verdict).slice(1)}`
          : "Every count is judged twice: against chance at its own size, and against this repo's own last 26 weeks."}
      </p>

      <div className="mt-10">
        <RepoPulseView view={view} />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <BadgeCard fullName={pulse.repo.fullName} path={path} origin={SITE_URL} />
        <section className="rounded-xl border border-border bg-card p-4 sm:p-6" aria-labelledby="method-title">
          <Prompt command="explain" flags="--method" className="mb-3" />
          <h2 id="method-title" className="text-[17px] font-medium">
            How a week is called
          </h2>
          <div className="mt-2 grid gap-3 text-[14px] leading-relaxed text-muted-foreground">
            <p>
              Counts come from GitHub&apos;s public API, filed by ISO week, Monday to Sunday UTC. A week is called a real move only when the
              change clears chance at its size (a week of N moves about ±2.8√N by luck) and breaks the repo&apos;s usual week-to-week range.
              Under 10 a week is too few to call.
            </p>
            <p>
              Check last week on GitHub:{" "}
              <a className="text-foreground underline-offset-4 hover:underline" href={search(`is:issue created:${range}`)} rel="noopener">
                issues opened
              </a>
              ,{" "}
              <a className="text-foreground underline-offset-4 hover:underline" href={search(`is:issue closed:${range}`)} rel="noopener">
                issues closed
              </a>
              ,{" "}
              <a className="text-foreground underline-offset-4 hover:underline" href={`${pulse.repo.htmlUrl}/pulls?q=${encodeURIComponent(`is:pr is:merged merged:${range}`)}`} rel="noopener">
                PRs merged
              </a>
              . Read {new Date(pulse.fetchedAt).toISOString().slice(11, 16)} UTC; refreshed hourly.
            </p>
            <p className="border-l-2 border-foreground pl-3 text-foreground">
              Maintainer? Add a <code className="font-mono text-[13px]">.wowyoy</code> file with{" "}
              <code className="font-mono text-[13px]">optout: true</code> to the repo root and this page stops reading the repo within the hour.
            </p>
            <p>
              Same test, your own numbers:{" "}
              <Link href="/fluke" className="text-foreground underline-offset-4 hover:underline">
                the Fluke Test
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
