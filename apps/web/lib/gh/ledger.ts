import { after } from "next/server"
import { unstable_cache } from "next/cache"
import { latestClosedWeek, shiftWeek, type IsoWeek } from "@workspace/metrics"
import { measureInfo } from "@workspace/feeds/github/types"
import { WINDOW_WEEKS } from "@workspace/feeds/github/aggregate"
import { readWatched } from "./data"
import { canonicalPath } from "./view"

export interface RepoLedgerRow {
  owner: string
  repo: string
  /** "stars", "forks", "issues opened", ... */
  measure: string
  value: number
  /** Relative change vs the week before. */
  change: number
  call: "real" | "edge" | "noise" | "too-few"
  path: string
}

/** How long a Ledger page waits for repo rows before rendering without them. */
const WAIT_MS = 4000

/**
 * Repo Pulse rows for a closed week on the Monday Ledger: the real moves in watched repos that week.
 * Repos are listed alphabetically, never ranked against each other. Weeks older than the 26-week
 * window, and repos GitHub couldn't answer for, have no rows.
 *
 * Reading every watched repo cold takes minutes, so the rows are cached per week, and a page that
 * finds them cold renders without them while the read finishes after the response.
 */
export async function repoRowsForWeek(week: IsoWeek): Promise<RepoLedgerRow[]> {
  const latest = latestClosedWeek()
  if (week.monday > latest.monday || week.monday < shiftWeek(latest, 1 - WINDOW_WEEKS).monday) return []
  const rows = cachedRows(week)
  const late = Symbol("late")
  const got = await Promise.race([rows, new Promise<typeof late>((r) => setTimeout(() => r(late), WAIT_MS))])
  if (got !== late) return got
  after(() => rows.then(() => undefined, () => undefined))
  return []
}

const cachedRows = (week: IsoWeek) =>
  unstable_cache(() => readRows(week), ["gh-ledger-rows", week.id], { revalidate: 3600, tags: ["github", "gh-ledger"] })()

async function readRows(week: IsoWeek): Promise<RepoLedgerRow[]> {
  const { pulses } = await readWatched()
  return pulses.flatMap((p) => {
    const i = p.weeks.findIndex((w) => w.id === week.id)
    if (i < 1 || i >= p.closed) return []
    const [owner = "", repo = ""] = p.repo.fullName.split("/")
    return p.measures.flatMap((m) => {
      const v = m.calls[i]
      const value = m.counts[i]
      if (!v || v.call !== "real" || value == null) return []
      return [{ owner, repo, measure: measureInfo[m.measure].label, value, change: v.relativeChange, call: v.call, path: canonicalPath(p.repo.fullName) }]
    })
  })
}
