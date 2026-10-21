import { describe, expect, it } from "vitest"
import {
  BUDGET,
  MAX_REQUESTS,
  GitHubError,
  countQuery,
  createTransport,
  fetchRepoPulse,
  parseOptOut,
  pulseWindow,
  validRepoName,
  type GhTransport,
  type RepoPulse,
} from "../src/github"
import { fixtureTransport } from "../src/github/fixtures/transport"
import { scenarios, type RepoScenario } from "../src/github/fixtures/scenarios"

const now = new Date("2026-10-21T15:00:00Z")
const transport = fixtureTransport({ now: () => now, synthesize: (r) => r === "acme/synth" })

async function ok(owner: string, repo: string, t: GhTransport = transport, auth: "token" | "none" = "token"): Promise<RepoPulse> {
  const res = await fetchRepoPulse(owner, repo, { transport: t, auth, now })
  if (res.status !== "ok") throw new Error(`expected ok, got ${res.status}`)
  return res.pulse
}

const measure = (p: RepoPulse, id: string) => p.measures.find((m) => m.measure === id)!

describe("reading a repo from the API shapes", () => {
  it("recovers every weekly count of the scenario", async () => {
    const p = await ok("posthog", "posthog")
    expect(p.repo.fullName).toBe("PostHog/posthog")
    expect(p.weeks).toHaveLength(27)
    for (const m of p.measures) {
      expect(m.status, m.measure).toBe("ok")
      expect(m.counts, m.measure).toEqual(scenarios["posthog/posthog"]!.weekly[m.measure])
    }
  })

  it("stays inside the request budget", async () => {
    expect(MAX_REQUESTS).toBeLessThanOrEqual(30)
    const p = await ok("posthog", "posthog")
    expect(p.requests).toBeLessThanOrEqual(MAX_REQUESTS)
    expect(measure(p, "stars").requests).toBeLessThanOrEqual(BUDGET.stars)
    expect(measure(p, "issues-opened").requests).toBe(1)
  })

  it("judges the latest closed week", async () => {
    const p = await ok("posthog", "posthog")
    expect(measure(p, "stars").calls[25]!.call).toBe("real")
    expect(measure(p, "prs-merged").calls[25]!.call).toBe("noise")
    expect(measure(p, "forks").calls[25]!.call).toBe("too-few")
    expect(measure(p, "stars").calls[26]).toBeNull()
  })

  it("marks stars partial when the window needs more pages than the budget", async () => {
    const busy: RepoScenario = {
      ...scenarios["posthog/posthog"]!,
      weekly: { ...scenarios["posthog/posthog"]!.weekly, stars: Array.from({ length: 27 }, () => 150) },
    }
    const t = fixtureTransport({ now: () => now, scenarios: { "busy/repo": { ...busy, repo: { ...busy.repo, full_name: "busy/repo" } } } })
    const p = await ok("busy", "repo", t)
    const stars = measure(p, "stars")
    expect(stars.status).toBe("partial")
    expect(stars.requests).toBe(BUDGET.stars)
    const covered = stars.counts.filter((c) => c != null)
    expect(covered.slice(0, -1).every((c) => c === 150)).toBe(true)
    expect(stars.counts[0]).toBeNull()
    expect(stars.note).toMatch(/only the last \d+ of 26 weeks/)
  })

  it("says star history isn't available past GitHub's 40,000 cap, and still reads the rest", async () => {
    const p = await ok("vercel", "next.js")
    const stars = measure(p, "stars")
    expect(stars.status).toBe("unavailable")
    expect(stars.requests).toBe(0)
    expect(stars.note).toMatch(/40,000 stargazers/)
    expect(measure(p, "forks").status).toBe("partial")
    expect(measure(p, "issues-closed").calls[25]!.call).toBe("real")
  })

  it("can't count issues and PRs without signing in", async () => {
    const p = await ok("posthog", "posthog", transport, "none")
    expect(measure(p, "issues-opened").status).toBe("unavailable")
    expect(measure(p, "stars").status).toBe("ok")
  })

  it("asks GitHub search for each week in UTC", () => {
    const q = countQuery("PostHog/posthog", "prs-merged", pulseWindow(now))
    expect(q).toContain('w25: search(query: "repo:PostHog/posthog is:pr is:merged merged:2026-10-12T00:00:00Z..2026-10-18T23:59:59Z", type: ISSUE)')
    expect(q.match(/search\(/g)).toHaveLength(27)
  })

  it("generates a stable repo for watched names", async () => {
    const a = await ok("acme", "synth")
    const b = await ok("acme", "synth")
    expect(a.measures.map((m) => m.counts)).toEqual(b.measures.map((m) => m.counts))
  })
})

describe("the states that aren't a pulse", () => {
  it("not found, private, invalid", async () => {
    expect(await fetchRepoPulse("nobody", "nothing", { transport, auth: "token", now })).toEqual({ status: "not-found", reason: "missing" })
    expect(await fetchRepoPulse("wowyoy-fixtures", "private-repo", { transport, auth: "token", now })).toEqual({ status: "not-found", reason: "private" })
    expect(await fetchRepoPulse("bad name", "x", { transport, auth: "token", now })).toEqual({ status: "not-found", reason: "invalid" })
  })

  it("opted out: no numbers are read", async () => {
    let calls = 0
    const t: GhTransport = (r) => (calls++, transport(r))
    const res = await fetchRepoPulse("wowyoy-fixtures", "opted-out", { transport: t, auth: "token", now })
    expect(res.status).toBe("opted-out")
    expect(calls).toBe(2)
  })

  it("rate limited: unavailable with the reset time, never a throw", async () => {
    const res = await fetchRepoPulse("wowyoy-fixtures", "rate-limited", { transport, auth: "token", now })
    expect(res).toMatchObject({ status: "unavailable", reason: "rate-limited" })
    expect(res.status === "unavailable" && res.resetAt).toBeTruthy()
  })

  it("a measure that hits the limit midway is marked, the rest still show", async () => {
    const t: GhTransport = (r) => (r.path.includes("/forks") ? Promise.reject(new GitHubError("rate-limited", "limit")) : transport(r))
    const p = await ok("posthog", "posthog", t)
    expect(measure(p, "forks")).toMatchObject({ status: "unavailable" })
    expect(measure(p, "forks").note).toMatch(/limit/)
    expect(measure(p, "stars").status).toBe("ok")
  })

  it("fails closed when the opt-out file can't be read", async () => {
    const t: GhTransport = (r) => (r.path.endsWith("/.wowyoy") ? Promise.resolve({ status: 500, data: null, link: null, remaining: null }) : transport(r))
    expect((await fetchRepoPulse("posthog", "posthog", { transport: t, auth: "token", now })).status).toBe("unavailable")
  })
})

describe("names and files", () => {
  it("accepts GitHub names and rejects the rest", () => {
    expect(validRepoName("vercel", "next.js")).toBe(true)
    expect(validRepoName("calcom", "cal.com")).toBe(true)
    expect(validRepoName("-x", "y")).toBe(false)
    expect(validRepoName("x", "..")).toBe(false)
    expect(validRepoName("x", "y.git")).toBe(false)
    expect(validRepoName("x", "a/b")).toBe(false)
  })

  it("reads the opt-out file", () => {
    expect(parseOptOut("optout: true\n")).toBe(true)
    expect(parseOptOut("# wowyoy\nOptOut: yes # please")).toBe(true)
    expect(parseOptOut("optout: false")).toBe(false)
    expect(parseOptOut("")).toBe(false)
  })
})

describe("the live transport", () => {
  const response = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })

  it("sends the API version, auth and the hour-long cache hint", async () => {
    let seen: { url: string; init: RequestInit & { next?: { revalidate?: number; tags?: string[] } } } | null = null
    const t = createTransport({
      fetch: (async (url: string, init: RequestInit) => ((seen = { url, init }), response(200, { ok: 1 }, { "x-ratelimit-remaining": "4990" }))) as typeof fetch,
      authorization: async () => "Bearer t0k3n",
    })
    const res = await t({ path: "/repos/a/b", tags: ["github"] })
    expect(res).toMatchObject({ status: 200, remaining: 4990 })
    expect(seen!.url).toBe("https://api.github.com/repos/a/b")
    expect(seen!.init.next).toEqual({ revalidate: 3600, tags: ["github"] })
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe("Bearer t0k3n")
    expect((seen!.init.headers as Record<string, string>)["X-GitHub-Api-Version"]).toBe("2022-11-28")
  })

  it("turns rate limits and outages into GitHubError, and passes 404 through", async () => {
    const limited = createTransport({
      fetch: (async () => response(403, { message: "API rate limit exceeded for 1.2.3.4." }, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1792600000" })) as typeof fetch,
    })
    await expect(limited({ path: "/x" })).rejects.toMatchObject({ kind: "rate-limited", resetAt: new Date(1792600000e3).toISOString() })
    const down = createTransport({ fetch: (async () => response(502, { message: "Bad gateway" })) as typeof fetch })
    await expect(down({ path: "/x" })).rejects.toMatchObject({ kind: "github-down" })
    const offline = createTransport({ fetch: (async () => Promise.reject(new TypeError("fetch failed"))) as typeof fetch })
    await expect(offline({ path: "/x" })).rejects.toMatchObject({ kind: "offline" })
    const missing = createTransport({ fetch: (async () => response(404, { message: "Not Found" })) as typeof fetch })
    expect((await missing({ path: "/x" })).status).toBe(404)
  })
})
