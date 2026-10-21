import type { NoiseCall } from "@workspace/metrics"
import { paths } from "@workspace/compiler/site"
import { latestCalls, realMoves, repoHeadline, whyText, type HeadlinePart } from "@workspace/feeds/github/read"
import { measureInfo, type MeasureStatus, type RepoMeasure, type RepoPulse } from "@workspace/feeds/github/types"

/** A week's verdict, as much as the page needs. */
export interface CallView {
  call: NoiseCall
  before: number
  after: number
  relativeChange: number
  reason: string
}

export interface MeasureView {
  id: RepoMeasure
  name: string
  label: string
  description: string
  status: MeasureStatus
  note: string | null
  counts: (number | null)[]
  calls: (CallView | null)[]
  bands: ([number, number] | null)[]
}

/** Everything the repo page's interactive parts need, plain and serialisable. */
export interface RepoView {
  fullName: string
  /** Canonical lowercase path, /gh/owner/repo. */
  path: string
  htmlUrl: string
  description: string | null
  language: string | null
  stars: number
  forks: number
  archived: boolean
  weeks: { id: string; monday: string; sunday: string }[]
  closed: number
  measures: MeasureView[]
  headline: HeadlinePart[]
  fetchedAt: string
}

export const canonicalPath = (fullName: string) => {
  const [owner = "", repo = ""] = fullName.toLowerCase().split("/")
  return paths.repo(owner, repo)
}

export function repoView(p: RepoPulse): RepoView {
  return {
    fullName: p.repo.fullName,
    path: canonicalPath(p.repo.fullName),
    htmlUrl: p.repo.htmlUrl,
    description: p.repo.description,
    language: p.repo.language,
    stars: p.repo.stars,
    forks: p.repo.forks,
    archived: p.repo.archived,
    weeks: p.weeks.map((w) => ({ id: w.id, monday: w.monday, sunday: w.sunday })),
    closed: p.closed,
    measures: p.measures.map((m) => ({
      id: m.measure,
      ...measureInfo[m.measure],
      status: m.status,
      note: m.note,
      counts: m.counts,
      calls: m.calls.map((v) => (v ? { call: v.call, before: v.before, after: v.after, relativeChange: v.relativeChange, reason: whyText(v) } : null)),
      bands: m.bands,
    })),
    headline: repoHeadline(p),
    fetchedAt: p.fetchedAt,
  }
}

export interface MoveView {
  fullName: string
  path: string
  measure: RepoMeasure
  name: string
  value: number
  call: CallView
}

/** The real moves of a repo's latest closed week, biggest first. */
export function movesOf(p: RepoPulse): MoveView[] {
  return realMoves(latestCalls(p)).map((c) => ({
    fullName: p.repo.fullName,
    path: canonicalPath(p.repo.fullName),
    measure: c.measure,
    name: measureInfo[c.measure].name,
    value: c.value,
    call: { call: c.verdict.call, before: c.verdict.before, after: c.verdict.after, relativeChange: c.verdict.relativeChange, reason: whyText(c.verdict) },
  }))
}
