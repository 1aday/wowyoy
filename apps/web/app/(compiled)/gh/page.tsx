import type { Metadata } from "next"
import Link from "next/link"
import { paths, robotsMeta } from "@workspace/compiler"
import { Prompt } from "@workspace/ui/brand/prompt"
import { RepoSearch } from "@/components/gh/repo-search"
import { WatchedMoves } from "@/components/gh/watched-moves"
import { WATCHED, watchedGroups } from "@/lib/gh/seed"

const description =
  "Stars, forks, issues, merged PRs and commits for any public GitHub repo, by ISO week, each week judged real or noise. With a README badge."

export const metadata: Metadata = {
  title: "Repo Pulse",
  description,
  alternates: { canonical: paths.ghIndex() },
  robots: robotsMeta({ kind: "fixed", path: paths.ghIndex() }),
  openGraph: { title: "Repo Pulse", description, url: paths.ghIndex() },
}

const steps = [
  {
    n: "01",
    title: "Counted by the week",
    body: "New stars, forks, issues opened and closed, merged PRs and commits, from GitHub's public API, filed by ISO week from Monday to Sunday UTC.",
  },
  {
    n: "02",
    title: "Judged against its own noise",
    body: "A week of N stars moves about ±2.8√N on luck alone. A move is real only when it clears that and the repo's own last 26 weeks. Under 10 a week, there's nothing to call.",
  },
  {
    n: "03",
    title: "A badge that says it",
    body: (
      <>
        Each repo page has a README badge with last week&apos;s call, like <span className="num text-foreground">stars ▲14% WoW · real</span>,
        refreshed hourly and linked back to the weeks behind it.
      </>
    ),
  },
]

export default function RepoPulseIndex() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-12 pb-24 sm:px-8">
      <Prompt command="repo_pulse" flags="--repo owner/repo --weeks 26" className="mb-4" />
      <h1 className="pixel-79 max-w-5xl text-balance max-md:pixel-46">
        Is your repo&apos;s week real?
        <span className="cursor-block" aria-hidden />
      </h1>
      <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
        Stars, forks, issues and merged PRs for any public GitHub repo, week by week. Each closed week is judged against chance at its size
        and against the repo&apos;s own history, so a filled pill means the move is real.
      </p>
      <RepoSearch className="mt-10" />

      <div className="mt-14">
        <WatchedMoves watched={WATCHED.length} />
      </div>

      <section className="grid gap-10 py-20 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n}>
            <div className="label-mono">{s.n}</div>
            <h2 className="mt-3 text-[17px] font-medium">{s.title}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="watched-title" className="border-t border-border pt-12">
        <h2 id="watched-title" className="text-[17px] font-medium">
          Watched repos
        </h2>
        <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          {WATCHED.length} popular public repos, read every hour for the list above. Any other public repo works the same from the search box.
        </p>
        <div className="mt-8 grid gap-10">
          {watchedGroups.map((g) => (
            <div key={g.name} className="min-w-0">
              <div className="label-mono">{g.name}</div>
              <ul className="mt-3 columns-2 gap-6 sm:columns-3 lg:columns-4">
                {g.repos.map((r) => (
                  <li key={r} className="min-w-0 truncate py-[3px]">
                    <Link href={`/gh/${r}`} prefetch={false} className="font-mono text-[12.5px] text-muted-foreground transition-colors duration-[80ms] hover:text-foreground">
                      {r}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-12 max-w-2xl border-l-2 border-foreground pl-3 text-[13.5px] leading-relaxed">
          Public data only. Maintainers can turn Repo Pulse off for a repo with a <code className="font-mono">.wowyoy</code> file in the
          repo root containing <code className="font-mono">optout: true</code>.
        </p>
      </section>
    </main>
  )
}
