import type { IsoWeek } from "@workspace/metrics"

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

/** Repo Pulse rows for a closed week on the Monday Ledger: real moves in watched repos. Owned by the Repo Pulse build. */
export async function repoRowsForWeek(_week: IsoWeek): Promise<RepoLedgerRow[]> {
  return []
}
