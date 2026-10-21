import { isoWeekOf, shiftWeek } from "@workspace/metrics"
import { GitHubError, type GhResponse, type GhTransport } from "../client"
import { PER_PAGE, STARGAZER_PAGE_LIMIT } from "../fetch"
import type { RepoMeasure } from "../types"
import commitSample from "./samples/commit-activity.json" with { type: "json" }
import contentsSample from "./samples/contents-wowyoy.json" with { type: "json" }
import forkSample from "./samples/forks.json" with { type: "json" }
import repoSample from "./samples/repo.json" with { type: "json" }
import starSample from "./samples/stargazers.json" with { type: "json" }
import { scenarios as handWritten, synthScenario, type RepoScenario } from "./scenarios"

const DAY = 864e5
const WEEK = 7 * DAY
const API = "https://api.github.com"

export interface FixtureOptions {
  scenarios?: Record<string, RepoScenario>
  now?: () => Date
  /** Repos (lowercase "owner/repo") that get a generated scenario when none is written by hand. */
  synthesize?: (fullName: string) => boolean
}

/** Event times for one measure: each week's count spread evenly over the week (or the part of it that has passed). */
function timeline(weekly: readonly number[], now: Date) {
  const current = isoWeekOf(now)
  const out: number[] = []
  weekly.forEach((count, k) => {
    const w = shiftWeek(current, k - (weekly.length - 1))
    const start = Date.parse(`${w.monday}T00:00:00Z`)
    const end = Math.min(start + WEEK, +now)
    for (let j = 0; j < count; j++) out.push(Math.floor(start + ((j + 0.5) / count) * (end - start)))
  })
  return out
}

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z")

function ok(data: unknown, link: string | null = null): GhResponse {
  return { status: 200, data, link, remaining: 4999 }
}
const notFound: GhResponse = { status: 404, data: { message: "Not Found", documentation_url: "https://docs.github.com/rest" }, link: null, remaining: 4999 }

function links(path: string, page: number, last: number) {
  const url = (p: number) => `<${API}${path.replace(/([?&])page=\d+/, `$1page=${p}`)}>`
  const out: string[] = []
  if (page > 1) out.push(`${url(page - 1)}; rel="prev"`, `${url(1)}; rel="first"`)
  if (page < last) out.push(`${url(page + 1)}; rel="next"`, `${url(last)}; rel="last"`)
  return out.length ? out.join(", ") : null
}

/** Every event of a measure, oldest first, including the ones before the window (spread back to the repo's creation). */
function allEvents(s: RepoScenario, measure: "stars" | "forks", now: Date) {
  const recent = timeline(s.weekly[measure], now)
  const total = measure === "stars" ? s.repo.stargazers_count : s.repo.forks_count
  const pre = Math.max(0, total - recent.length)
  const from = Date.parse(s.repo.created_at)
  // Older events end before the first scenario week starts.
  const first = shiftWeek(isoWeekOf(now), -(s.weekly[measure].length - 1))
  const to = Date.parse(`${first.monday}T00:00:00Z`)
  return {
    total: pre + recent.length,
    at: (i: number) => (i < pre ? Math.floor(from + ((i + 0.5) / pre) * (to - 1 - from)) : recent[i - pre]!),
  }
}

/**
 * A GhTransport that answers from scenarios in the shapes of GitHub's REST and GraphQL responses,
 * with real pagination (Link headers, the 400-page stargazer cap) so the client code paths are the live ones.
 */
export function fixtureTransport(opts: FixtureOptions = {}): GhTransport {
  const all = { ...handWritten, ...opts.scenarios }
  const clock = opts.now ?? (() => new Date())
  const find = (full: string): RepoScenario | null => {
    const key = full.toLowerCase()
    if (all[key]) return all[key]!
    if (!opts.synthesize?.(key)) return null
    const now = clock()
    const monday = Date.parse(`${isoWeekOf(now).monday}T00:00:00Z`)
    return synthScenario(key, Math.min(1, (+now - monday) / WEEK))
  }

  return async (req) => {
    const now = clock()
    const url = new URL(`${API}${req.path}`)
    if (req.path === "/graphql") return graphql(req.body ?? "", find, now)
    const m = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(url.pathname)
    if (!m) return notFound
    const s = find(`${m[1]}/${m[2]}`)
    if (!s) return notFound
    if (s.rateLimited) throw new GitHubError("rate-limited", "API rate limit exceeded", iso(+now + 20 * 60e3))
    const rest = m[3] ?? ""
    const page = Number(url.searchParams.get("page") ?? 1)

    if (rest === "") {
      const [owner, name] = s.repo.full_name.split("/")
      return ok({
        ...repoSample,
        ...s.repo,
        name,
        owner: { ...repoSample.owner, login: owner },
        html_url: `https://github.com/${s.repo.full_name}`,
        url: `${API}/repos/${s.repo.full_name}`,
        homepage: s.repo.homepage ?? null,
        default_branch: s.repo.default_branch ?? "main",
        private: !!s.private,
        visibility: s.private ? "private" : "public",
        stargazers_count: s.repo.stargazers_count,
        watchers_count: s.repo.stargazers_count,
        forks_count: s.repo.forks_count,
        open_issues_count: s.repo.open_issues_count,
        pushed_at: iso(+now - 3 * 3600e3),
      })
    }
    if (rest === "/contents/.wowyoy") {
      return s.optOut ? ok({ ...contentsSample, content: Buffer.from("# wowyoy\noptout: true\n").toString("base64") }) : notFound
    }
    if (rest === "/stargazers") {
      const ev = allEvents(s, "stars", now)
      const last = Math.max(1, Math.ceil(ev.total / PER_PAGE))
      if (page > STARGAZER_PAGE_LIMIT) {
        return {
          status: 422,
          data: { message: "In order to keep the API fast for everyone, pagination is limited for this resource." },
          link: null,
          remaining: 4999,
        }
      }
      const items = []
      for (let i = (page - 1) * PER_PAGE; i < Math.min(ev.total, page * PER_PAGE); i++) {
        items.push({ ...starSample[i % starSample.length], starred_at: iso(ev.at(i)) })
      }
      return ok(items, links(req.path, page, Math.min(last, STARGAZER_PAGE_LIMIT)))
    }
    if (rest === "/forks") {
      const ev = allEvents(s, "forks", now)
      const last = Math.max(1, Math.ceil(ev.total / PER_PAGE))
      const items = []
      for (let k = (page - 1) * PER_PAGE; k < Math.min(ev.total, page * PER_PAGE); k++) {
        const created = iso(ev.at(ev.total - 1 - k))
        items.push({ ...forkSample[k % forkSample.length], id: 1_000_000 + k, created_at: created, updated_at: created })
      }
      return ok(items, links(req.path, page, last))
    }
    if (rest === "/stats/commit_activity") return ok(commitActivity(s.weekly.commits, now))
    return notFound
  }
}

/** 52 Sunday-to-Saturday weeks ending this week, stamped at 05:00 UTC the way GitHub stamps US-local midnights. */
function commitActivity(weekly: readonly number[], now: Date) {
  const perDay = new Map<number, number>()
  for (const t of timeline(weekly, now)) {
    const day = Math.floor(t / DAY) * DAY
    perDay.set(day, (perDay.get(day) ?? 0) + 1)
  }
  const today = Math.floor(+now / DAY) * DAY
  const sunday = today - new Date(today).getUTCDay() * DAY
  return Array.from({ length: 52 }, (_, k) => {
    const start = sunday - (51 - k) * WEEK
    const days = Array.from({ length: 7 }, (_, d) => perDay.get(start + d * DAY) ?? 0)
    return { ...commitSample[0], days, total: days.reduce((a, b) => a + b, 0), week: (start + 5 * 3600e3) / 1000 }
  })
}

const measureFor = (q: string): RepoMeasure | null =>
  /is:pr/.test(q) && /merged:/.test(q) ? "prs-merged" : /is:issue/.test(q) && /closed:/.test(q) ? "issues-closed" : /is:issue/.test(q) ? "issues-opened" : null

function graphql(body: string, find: (full: string) => RepoScenario | null, now: Date): GhResponse {
  const query = (JSON.parse(body || "{}") as { query?: string }).query ?? ""
  const data: Record<string, { issueCount: number } | null> = {}
  for (const m of query.matchAll(/(\w+): search\(query: ("(?:[^"\\]|\\.)*")/g)) {
    const q = JSON.parse(m[2]!) as string
    const repo = /repo:(\S+)/.exec(q)?.[1] ?? ""
    const s = find(repo)
    if (s?.rateLimited) throw new GitHubError("rate-limited", "API rate limit exceeded", iso(+now + 20 * 60e3))
    const measure = measureFor(q)
    const range = /(?:created|closed|merged):(\S+)\.\.(\S+)/.exec(q)
    if (!s || !measure || !range) {
      data[m[1]!] = { issueCount: 0 }
      continue
    }
    const from = Date.parse(range[1]!)
    const to = Date.parse(range[2]!)
    data[m[1]!] = { issueCount: timeline(s.weekly[measure], now).filter((t) => t >= from && t <= to + 999).length }
  }
  return ok({ data })
}
