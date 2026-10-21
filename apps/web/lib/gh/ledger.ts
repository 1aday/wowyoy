import type { IsoWeek } from "@workspace/metrics"
import { measureInfo } from "@workspace/feeds/github/types"
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

/**
 * Repo Pulse rows for a closed week on the Monday Ledger: the real moves in watched repos that week.
 * Repos are listed alphabetically, never ranked against each other. Weeks older than the 26-week
 * window, and repos GitHub couldn't answer for, have no rows.
 */
export async function repoRowsForWeek(week: IsoWeek): Promise<RepoLedgerRow[]> {
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
