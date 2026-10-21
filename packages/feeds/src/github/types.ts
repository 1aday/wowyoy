import type { IsoWeek, NoiseVerdict } from "@workspace/metrics"

/** What Repo Pulse counts for a repo, one number per ISO week. */
export const repoMeasures = ["stars", "forks", "issues-opened", "issues-closed", "prs-merged", "commits"] as const
export type RepoMeasure = (typeof repoMeasures)[number]

export const measureInfo: Record<RepoMeasure, { name: string; label: string; description: string }> = {
  stars: { name: "Stars", label: "stars", description: "New stars, dated by when each was given." },
  forks: { name: "Forks", label: "forks", description: "New forks that still exist." },
  "issues-opened": { name: "Issues opened", label: "issues opened", description: "Issues opened. Pull requests are not counted." },
  "issues-closed": { name: "Issues closed", label: "issues closed", description: "Issues closed. Pull requests are not counted." },
  "prs-merged": { name: "PRs merged", label: "PRs merged", description: "Pull requests merged." },
  commits: { name: "Commits", label: "commits", description: "Commits on the default branch." },
}

export function isRepoMeasure(x: unknown): x is RepoMeasure {
  return typeof x === "string" && (repoMeasures as readonly string[]).includes(x)
}

export interface RepoInfo {
  /** As GitHub spells it: "PostHog/posthog". */
  fullName: string
  owner: string
  repo: string
  description: string | null
  htmlUrl: string
  homepage: string | null
  language: string | null
  stars: number
  forks: number
  openIssues: number
  defaultBranch: string
  createdAt: string
  pushedAt: string | null
  archived: boolean
}

export type MeasureStatus = "ok" | "partial" | "unavailable"

export interface MeasureSeries {
  measure: RepoMeasure
  status: MeasureStatus
  /** One count per week of the window; null where the week isn't fully covered. */
  counts: (number | null)[]
  /** Why the measure is partial or unavailable, one plain sentence for the page. */
  note: string | null
  /** GitHub requests this measure cost. */
  requests: number
}

export interface MeasureRead extends MeasureSeries {
  /** The verdict for each closed week; null for open weeks, gaps and the first week. */
  calls: (NoiseVerdict | null)[]
  /** Trailing 13 closed weeks, mean ±2σ, for each week. */
  bands: ([number, number] | null)[]
}

export type GitHubAuthKind = "app" | "token" | "none"

export interface RepoPulse {
  repo: RepoInfo
  /** The window, oldest first: `closed` closed weeks, then the weeks still open (usually one). */
  weeks: IsoWeek[]
  closed: number
  measures: MeasureRead[]
  /** ISO time the data was read. */
  fetchedAt: string
  requests: number
  auth: GitHubAuthKind
}

export type PulseResult =
  | { status: "ok"; pulse: RepoPulse }
  | { status: "not-found"; reason: "invalid" | "missing" | "private" }
  | { status: "opted-out"; repo: RepoInfo }
  | { status: "unavailable"; reason: "rate-limited" | "github-down" | "offline"; resetAt: string | null }
