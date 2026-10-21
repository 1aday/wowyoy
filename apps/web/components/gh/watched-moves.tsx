"use client"

import * as React from "react"
import Link from "next/link"
import { formatWeekRange } from "@workspace/metrics"
import { Prompt } from "@workspace/ui/brand/prompt"
import { Skeleton } from "@workspace/ui/components/skeleton"
import type { MovesFeed } from "@/lib/gh/moves"
import { RepoMove } from "./repo-move"

/** Last week's real moves across the watched repos, alphabetical: each repo judged only against itself. */
export function WatchedMoves({ watched }: { watched: number }) {
  const [feed, setFeed] = React.useState<MovesFeed | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    let live = true
    fetch("/gh/moves.json")
      .then((r) => (r.ok ? (r.json() as Promise<MovesFeed>) : Promise.reject(new Error(String(r.status)))))
      .then((f) => live && setFeed(f))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6" aria-labelledby="moves-title" aria-busy={!feed && !failed}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Prompt command="repo_pulse" flags={`--watched ${watched} --only real`} />
        {feed && (
          <span className="font-mono text-[12px] text-muted-foreground">
            {feed.week.id} · {formatWeekRange(feed.week.monday)}
          </span>
        )}
      </div>
      <h2 id="moves-title" className="text-[17px] font-medium">
        {feed ? movesTitle(feed) : "Last week's real moves"}
      </h2>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
        Listed by name. A repo is only ever judged against its own weeks, never ranked against another.
      </p>

      <div className="mt-4">
        {failed ? (
          <p className="text-[14px] text-muted-foreground">GitHub&apos;s numbers are temporarily unavailable. Any repo page below still works.</p>
        ) : !feed ? (
          <div className="grid gap-2" data-testid="moves-loading">
            {Array.from({ length: 4 }, (_, k) => (
              <Skeleton key={k} className="h-10 w-full" />
            ))}
          </div>
        ) : feed.moves.length ? (
          <ul className="divide-y divide-border border-y border-border" data-testid="moves">
            {feed.moves.map((m) => (
              <li key={`${m.path}:${m.measure}`}>
                <Link
                  href={`${m.path}?m=${m.measure}`}
                  prefetch={false}
                  className="flex h-11 items-center gap-3 px-1 text-[14px] transition-colors duration-[80ms] hover:bg-accent"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">{m.fullName}</span>
                  <span className="text-muted-foreground max-sm:hidden">{m.name}</span>
                  <span className="num w-16 text-right">{m.value.toLocaleString("en-US")}</span>
                  <span className="flex w-[86px] justify-end">
                    <RepoMove call={m.call} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted-foreground">Nothing moved beyond noise in the watched repos last week.</p>
        )}
        {feed && feed.missing > 0 && (
          <p className="mt-3 font-mono text-[11.5px] text-muted-foreground">
            {feed.missing} of {feed.watched} repos couldn&apos;t be read this hour and aren&apos;t included.
          </p>
        )}
      </div>
    </section>
  )
}

function movesTitle(f: MovesFeed) {
  const repos = new Set(f.moves.map((m) => m.path)).size
  if (!f.moves.length) return "No real moves last week"
  return `${f.moves.length} real ${f.moves.length === 1 ? "move" : "moves"} in ${repos} of ${f.read} repos last week`
}
