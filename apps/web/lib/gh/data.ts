import { cache } from "react"
import { unstable_cache } from "next/cache"
import { latestClosedWeek, type IsoWeek } from "@workspace/metrics"
import {
  GITHUB_REVALIDATE,
  GitHubError,
  authFromEnv,
  authorizer,
  createTransport,
  fetchRepoPulse,
  type GhRequest,
  type GhResponse,
  type GhTransport,
  type GitHubAuthKind,
  type PulseResult,
  type RepoPulse,
} from "@workspace/feeds"
import { WATCHED, isOptedOut, isWatched } from "./seed"

/** Dev and e2e only: answer from fixtures instead of GitHub. */
export const fixtureMode = () => process.env.WOWYOY_GITHUB_FIXTURES === "1"
const building = () => process.env.NEXT_PHASE === "phase-production-build"

/** A "still computing" answer (202) is passed through but never cached. */
class Uncached extends Error {
  constructor(readonly response: GhResponse) {
    super("uncached")
  }
}

/** Requests left this hour, as GitHub last reported. Batch scans stop early to keep some for visitors. */
let lastRemaining: number | null = null

/**
 * Live reads, cached in Next's data cache for an hour per request. The cache key is the request
 * (path, accept, body), never the token: GitHub App tokens rotate hourly and differ per instance.
 */
function liveTransport(): { transport: GhTransport; auth: GitHubAuthKind } {
  const { kind, authorization } = authorizer(authFromEnv())
  const raw = createTransport({ authorization, revalidate: false })
  const transport: GhTransport = async (req: GhRequest) => {
    // The build never calls GitHub; pages render on first request instead.
    if (building()) throw new GitHubError("offline", "GitHub is not read during the build")
    const read = unstable_cache(
      async () => {
        const res = await raw(req)
        if (res.remaining != null) lastRemaining = res.remaining
        if (res.status === 202) throw new Uncached(res)
        return res
      },
      ["github", req.method ?? "GET", req.path, req.accept ?? "", req.body ?? ""],
      { revalidate: GITHUB_REVALIDATE, tags: req.tags },
    )
    try {
      return await read()
    } catch (e) {
      if (e instanceof Uncached) return e.response
      throw e
    }
  }
  return { transport, auth: kind }
}

let source: Promise<{ transport: GhTransport; auth: GitHubAuthKind }> | null = null

function github() {
  source ??= fixtureMode()
    ? import("@workspace/feeds/github/fixtures/transport").then(({ fixtureTransport }) => ({
        transport: fixtureTransport({ synthesize: isWatched }),
        auth: "token" as const,
      }))
    : Promise.resolve(liveTransport())
  return source
}

export type RepoResult = Exclude<PulseResult, { status: "opted-out" }> | { status: "opted-out"; fullName: string }

/** One repo's pulse, read once per render (page, metadata and image share it). */
export const getRepoPulse = cache(async (owner: string, repo: string): Promise<RepoResult> => {
  if (isOptedOut(owner, repo)) return { status: "opted-out", fullName: `${owner}/${repo}` }
  const { transport, auth } = await github()
  const res = await fetchRepoPulse(owner, repo, { transport, auth })
  return res.status === "opted-out" ? { status: "opted-out", fullName: res.repo.fullName } : res
})

/**
 * Ask Next to regenerate this page within two minutes instead of the usual hour,
 * for renders that couldn't read GitHub (the cached page then heals itself).
 */
export async function retrySoon() {
  await unstable_cache(async () => true, ["github-retry"], { revalidate: 120 })()
}

/** Keep this many requests an hour for people opening repo pages. */
const RESERVE = 1000
const CONCURRENCY = 6

export interface WatchedRead {
  week: IsoWeek
  pulses: RepoPulse[]
  /** Watched repos that couldn't be read this time (rate limit, outage, budget). */
  missing: number
}

/** Read every watched repo, a few at a time, stopping early when the hourly allowance runs low. */
export async function readWatched(now = new Date()): Promise<WatchedRead> {
  const week = latestClosedWeek(now)
  const pulses: RepoPulse[] = []
  let missing = 0
  const queue = [...WATCHED]
  const worker = async () => {
    for (let full = queue.shift(); full; full = queue.shift()) {
      if (!fixtureMode() && lastRemaining != null && lastRemaining < RESERVE) {
        missing++
        continue
      }
      const [owner = "", repo = ""] = full.split("/")
      const res = await getRepoPulse(owner, repo)
      if (res.status === "ok") pulses.push(res.pulse)
      else if (res.status === "unavailable") missing++
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  pulses.sort((a, b) => a.repo.fullName.toLowerCase().localeCompare(b.repo.fullName.toLowerCase()))
  return { week, pulses, missing }
}
