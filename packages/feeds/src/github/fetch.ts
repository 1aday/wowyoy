import { formatCompact } from "@workspace/metrics"
import { bucketByWeek, commitsByWeek, pulseWindow, readMeasure, type CommitWeek, type PulseWindow } from "./aggregate"
import { GitHubError, counted, pageOf, parseLink, type GhRequest, type GhResponse, type GhTransport } from "./client"
import { type GitHubAuthKind, type MeasureSeries, type PulseResult, type RepoInfo, type RepoMeasure } from "./types"

/**
 * The request budget for one repo refresh: at most 29 requests, read once an hour at most.
 *
 *   repo                1   existence, visibility, totals
 *   .wowyoy opt-out     1   contents API; a 404 means no opt-out
 *   stargazers        ≤20   100 a page, newest page first, back to the window start
 *   forks              ≤3   100 a page, newest first, back to the window start
 *   issue and PR counts 3   one GraphQL search-count query per measure, all weeks at once (signed-in only)
 *   commit activity     1   GitHub's precomputed 52-week stats
 *
 * A measure that runs out of pages before the window start is marked "partial" and only the
 * weeks it fully covers are shown. With a token GitHub allows 5,000 requests an hour; anonymous, 60.
 */
export const BUDGET = { repo: 1, optOut: 1, stars: 20, forks: 3, counts: 3, commits: 1 } as const
export const MAX_REQUESTS = Object.values(BUDGET).reduce((a, b) => a + b, 0)

export const PER_PAGE = 100
/** GitHub lists stargazers only up to page 400. */
export const STARGAZER_PAGE_LIMIT = 400
const STAR_ACCEPT = "application/vnd.github.star+json"

const OWNER = /^[a-z\d][a-z\d-]{0,38}$/i
const REPO = /^[\w.-]{1,100}$/

/** GitHub's own naming rules, so junk never reaches the API. */
export function validRepoName(owner: string, repo: string) {
  return OWNER.test(owner) && REPO.test(repo) && repo !== "." && repo !== ".." && !/\.git$/i.test(repo)
}

/** A `.wowyoy` file in the repo root with `optout: true` turns Repo Pulse off for that repo. */
export function parseOptOut(text: string) {
  return /^\s*optout\s*:\s*["']?(true|yes|1)["']?\s*(#.*)?$/im.test(text)
}

interface RawRepo {
  full_name: string
  name: string
  owner: { login: string }
  private: boolean
  visibility?: string
  description: string | null
  html_url: string
  homepage: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  default_branch: string
  created_at: string
  pushed_at: string | null
  archived: boolean
}

function toRepoInfo(r: RawRepo): RepoInfo {
  return {
    fullName: r.full_name,
    owner: r.owner.login,
    repo: r.name,
    description: r.description,
    htmlUrl: r.html_url,
    homepage: r.homepage || null,
    language: r.language,
    stars: r.stargazers_count,
    forks: r.forks_count,
    openIssues: r.open_issues_count,
    defaultBranch: r.default_branch,
    createdAt: r.created_at,
    pushedAt: r.pushed_at,
    archived: r.archived,
  }
}

type Get = (path: string, init?: Omit<GhRequest, "path">) => Promise<GhResponse>

const zeros = (win: PulseWindow) => win.weeks.map(() => 0)
const nulls = (win: PulseWindow) => win.weeks.map(() => null)

function coveredWeeks(counts: readonly (number | null)[], closed: number) {
  return counts.slice(0, closed).filter((c) => c != null).length
}

async function stars(get: Get, base: string, total: number, win: PulseWindow): Promise<Omit<MeasureSeries, "requests">> {
  if (total === 0) return { measure: "stars", status: "ok", counts: zeros(win), note: null }
  if (total > STARGAZER_PAGE_LIMIT * PER_PAGE) {
    return {
      measure: "stars",
      status: "unavailable",
      counts: nulls(win),
      note: `GitHub's API lists only the first 40,000 stargazers, so weekly star history isn't available for a repo with ${formatCompact(total)} stars.`,
    }
  }
  const stamps: string[] = []
  let page = Math.ceil(total / PER_PAGE)
  let used = 0
  let oldest = Infinity
  let complete = false
  while (used < BUDGET.stars && page >= 1) {
    const res = await get(`${base}/stargazers?per_page=${PER_PAGE}&page=${page}`, { accept: STAR_ACCEPT })
    used++
    if (res.status === 422) {
      return { measure: "stars", status: "unavailable", counts: nulls(win), note: "GitHub won't list this repo's stargazers that far back." }
    }
    if (res.status !== 200 || !Array.isArray(res.data)) throw new Error(`stargazers: ${res.status}`)
    const list = res.data as { starred_at: string }[]
    if (!list.length) {
      // The star count ran ahead of the list (deleted accounts): step to the real last page.
      const links = parseLink(res.link)
      const to = pageOf(links.last) ?? pageOf(links.prev)
      if (page === 1) {
        complete = true
        break
      }
      page = to != null && to < page ? to : page - 1
      continue
    }
    for (const s of list) {
      stamps.push(s.starred_at)
      oldest = Math.min(oldest, Date.parse(s.starred_at))
    }
    if (oldest < win.start || page === 1) {
      complete = true
      break
    }
    page--
  }
  const counts = bucketByWeek(stamps, win, complete ? null : oldest)
  if (complete) return { measure: "stars", status: "ok", counts, note: null }
  const n = coveredWeeks(counts, win.closed)
  return {
    measure: "stars",
    status: "partial",
    counts,
    note: `This repo gets more stars a week than ${used} pages of the API hold, so only the last ${n} of ${win.closed} weeks are counted.`,
  }
}

async function forks(get: Get, base: string, total: number, win: PulseWindow): Promise<Omit<MeasureSeries, "requests">> {
  if (total === 0) return { measure: "forks", status: "ok", counts: zeros(win), note: null }
  const stamps: string[] = []
  let oldest = Infinity
  let complete = false
  let used = 0
  for (let page = 1; used < BUDGET.forks; page++) {
    const res = await get(`${base}/forks?sort=newest&per_page=${PER_PAGE}&page=${page}`)
    used++
    if (res.status !== 200 || !Array.isArray(res.data)) throw new Error(`forks: ${res.status}`)
    const list = res.data as { created_at: string }[]
    for (const f of list) {
      stamps.push(f.created_at)
      oldest = Math.min(oldest, Date.parse(f.created_at))
    }
    if (oldest < win.start || list.length < PER_PAGE || !parseLink(res.link).next) {
      complete = true
      break
    }
  }
  const counts = bucketByWeek(stamps, win, complete ? null : oldest)
  if (complete) return { measure: "forks", status: "ok", counts, note: null }
  const n = coveredWeeks(counts, win.closed)
  return {
    measure: "forks",
    status: "partial",
    counts,
    note: `This repo gets more forks a week than ${used} pages of the API hold, so only the last ${n} of ${win.closed} weeks are counted.`,
  }
}

/** GitHub search qualifiers for each counted measure. */
export const searchQualifiers: Partial<Record<RepoMeasure, (range: string) => string>> = {
  "issues-opened": (r) => `is:issue created:${r}`,
  "issues-closed": (r) => `is:issue closed:${r}`,
  "prs-merged": (r) => `is:pr is:merged merged:${r}`,
}

/** One GraphQL query that counts a measure in every week of the window. */
export function countQuery(fullName: string, measure: RepoMeasure, win: PulseWindow) {
  const q = searchQualifiers[measure]!
  const fields = win.weeks.map((w, i) => {
    const search = `repo:${fullName} ${q(`${w.monday}T00:00:00Z..${w.sunday}T23:59:59Z`)}`
    return `w${i}: search(query: ${JSON.stringify(search)}, type: ISSUE) { issueCount }`
  })
  return `query {\n  ${fields.join("\n  ")}\n}`
}

async function searchCounts(get: Get, fullName: string, measure: RepoMeasure, win: PulseWindow): Promise<Omit<MeasureSeries, "requests">> {
  const res = await get("/graphql", { method: "POST", body: JSON.stringify({ query: countQuery(fullName, measure, win) }) })
  const data = (res.data as { data?: Record<string, { issueCount: number } | null> } | null)?.data
  if (res.status !== 200 || !data) throw new Error(`graphql: ${res.status}`)
  const counts = win.weeks.map((_, i) => data[`w${i}`]?.issueCount ?? null)
  return { measure, status: counts.every((c) => c != null) ? "ok" : "partial", counts, note: null }
}

async function commits(get: Get, base: string, win: PulseWindow): Promise<Omit<MeasureSeries, "requests">> {
  const res = await get(`${base}/stats/commit_activity`)
  if (res.status === 202) {
    return { measure: "commits", status: "unavailable", counts: nulls(win), note: "GitHub is still counting this repo's commits. They'll show within the hour." }
  }
  if (res.status === 204 || res.status === 409) return { measure: "commits", status: "ok", counts: zeros(win), note: null }
  if (res.status !== 200 || !Array.isArray(res.data)) throw new Error(`commit_activity: ${res.status}`)
  return { measure: "commits", status: "ok", counts: commitsByWeek(res.data as CommitWeek[], win), note: null }
}

const signedOutNote = "Issue and PR counts come from GitHub search, which needs a signed-in connection this server doesn't have."

function errorNote(e: unknown) {
  if (e instanceof GitHubError && e.kind === "rate-limited") return "GitHub's hourly limit ran out partway. This will fill in within the hour."
  return "GitHub didn't answer for this one. It will retry within the hour."
}

export interface FetchOptions {
  transport: GhTransport
  /** How the transport signs in; anonymous reads can't count issues or PRs. */
  auth: GitHubAuthKind
  now?: Date
}

/** Cache tags for one repo's reads. */
export const repoTags = (owner: string, repo: string) => ["github", `github:${owner}/${repo}`.toLowerCase()]

/**
 * Read a public repo's last 26 ISO weeks from the GitHub REST and GraphQL APIs and judge every
 * closed week. Never throws: GitHub trouble comes back as "unavailable", a missing or private repo as
 * "not-found", and a repo whose maintainers opted out as "opted-out" (with no numbers read).
 */
export async function fetchRepoPulse(owner: string, repo: string, opts: FetchOptions): Promise<PulseResult> {
  if (!validRepoName(owner, repo)) return { status: "not-found", reason: "invalid" }
  const now = opts.now ?? new Date()
  const tags = repoTags(owner, repo)
  const total = counted(opts.transport)
  const base = `/repos/${owner}/${repo}`
  const unavailable = (e: unknown): PulseResult =>
    e instanceof GitHubError
      ? { status: "unavailable", reason: e.kind, resetAt: e.resetAt }
      : { status: "unavailable", reason: "github-down", resetAt: null }

  let info: RepoInfo
  try {
    const res = await total.transport({ path: base, tags })
    if ([404, 410, 451].includes(res.status)) return { status: "not-found", reason: "missing" }
    if (res.status !== 200 || !res.data) return unavailable(null)
    const raw = res.data as RawRepo
    if (raw.private || (raw.visibility != null && raw.visibility !== "public")) return { status: "not-found", reason: "private" }
    info = toRepoInfo(raw)
    // Fail closed: if the opt-out file can't be read, nothing is shown.
    const file = await total.transport({ path: `${base}/contents/.wowyoy`, tags })
    if (file.status === 200) {
      const body = file.data as { content?: string; encoding?: string } | null
      const text = body?.content ? Buffer.from(body.content, (body.encoding as BufferEncoding) ?? "base64").toString("utf8") : ""
      if (parseOptOut(text)) return { status: "opted-out", repo: info }
    } else if (file.status !== 404) {
      return unavailable(null)
    }
  } catch (e) {
    return unavailable(e)
  }

  const win = pulseWindow(now)
  const errors: unknown[] = []
  const run = async (measure: RepoMeasure, fn: (get: Get) => Promise<Omit<MeasureSeries, "requests">>): Promise<MeasureSeries> => {
    const own = counted(total.transport)
    const get: Get = (path, init) => own.transport({ ...init, path, tags })
    try {
      return { ...(await fn(get)), requests: own.state.requests }
    } catch (e) {
      errors.push(e)
      return { measure, status: "unavailable", counts: nulls(win), note: errorNote(e), requests: own.state.requests }
    }
  }
  const signedIn = opts.auth !== "none"
  const counts = (["issues-opened", "issues-closed", "prs-merged"] as const).map((m) =>
    signedIn
      ? run(m, (get) => searchCounts(get, info.fullName, m, win))
      : Promise.resolve<MeasureSeries>({ measure: m, status: "unavailable", counts: nulls(win), note: signedOutNote, requests: 0 }),
  )
  const series = await Promise.all([
    run("stars", (get) => stars(get, base, info.stars, win)),
    run("forks", (get) => forks(get, base, info.forks, win)),
    ...counts,
    run("commits", (get) => commits(get, base, win)),
  ])

  // Nothing read at all because GitHub said no: that's an outage, not a quiet repo.
  if (errors.length && series.every((s) => s.status === "unavailable")) return unavailable(errors.find((e) => e instanceof GitHubError) ?? errors[0])

  return {
    status: "ok",
    pulse: {
      repo: info,
      weeks: win.weeks,
      closed: win.closed,
      measures: series.map((s) => readMeasure(s, win.closed)),
      fetchedAt: now.toISOString(),
      requests: total.state.requests,
      auth: opts.auth,
    },
  }
}

