export const GITHUB_API = "https://api.github.com"

/** Every GitHub read is cached for an hour (ISR): a repo page costs at most one refresh an hour. */
export const GITHUB_REVALIDATE = 3600

export interface GhRequest {
  /** Path under api.github.com, with its query string: "/repos/posthog/posthog/forks?sort=newest". */
  path: string
  accept?: string
  method?: "GET" | "POST"
  body?: string
  /** Cache tags, so a refresh can drop one repo's reads. */
  tags?: string[]
}

export interface GhResponse {
  status: number
  data: unknown
  /** The raw Link header, for pagination. */
  link: string | null
  /** x-ratelimit-remaining, when GitHub sent it. */
  remaining: number | null
}

/** Sends one request to GitHub. Throws GitHubError when GitHub can't answer now; returns everything else. */
export type GhTransport = (req: GhRequest) => Promise<GhResponse>

export type GitHubErrorKind = "rate-limited" | "github-down" | "offline"

export class GitHubError extends Error {
  constructor(
    readonly kind: GitHubErrorKind,
    message: string,
    /** When the rate limit resets, ISO. */
    readonly resetAt: string | null = null,
  ) {
    super(message)
    this.name = "GitHubError"
  }
}

/** Parse a Link header into { next: url, last: url, ... }. */
export function parseLink(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(",")) {
    const m = /<([^>]+)>\s*;\s*rel="([^"]+)"/.exec(part)
    if (m) for (const rel of m[2]!.split(/\s+/)) out[rel] = m[1]!
  }
  return out
}

/** The `page` number of a Link URL. */
export function pageOf(url: string | undefined): number | null {
  if (!url) return null
  const m = /[?&]page=(\d+)/.exec(url)
  return m ? Number(m[1]) : null
}

/** Turn a response GitHub sent into a thrown GitHubError when it means "not now". */
export function classify(status: number, headers: { get(name: string): string | null }, data: unknown): GitHubError | null {
  const message = typeof data === "object" && data && "message" in data ? String((data as { message: unknown }).message) : ""
  const remaining = headers.get("x-ratelimit-remaining")
  const reset = headers.get("x-ratelimit-reset")
  const retryAfter = headers.get("retry-after")
  const resetAt = reset
    ? new Date(Number(reset) * 1000).toISOString()
    : retryAfter
      ? new Date(Date.now() + Number(retryAfter) * 1000).toISOString()
      : null
  if (status === 429 || (status === 403 && (remaining === "0" || /rate limit/i.test(message)))) {
    return new GitHubError("rate-limited", message || "GitHub rate limit reached", resetAt)
  }
  if (status >= 500 || status === 401 || status === 403) return new GitHubError("github-down", message || `GitHub answered ${status}`)
  return null
}

export interface TransportOptions {
  /** The fetch to use. In Next.js the global fetch is the cached one. */
  fetch?: typeof fetch
  /** Returns the Authorization header value, or null for anonymous reads. */
  authorization?: () => Promise<string | null>
  revalidate?: number
}

/**
 * The plain transport: one fetch per request, cached by Next's fetch cache for an hour
 * (`next.revalidate`). Use it with a long-lived token; with a GitHub App the token rotates
 * hourly and is part of the cache key, so the web app wraps reads in its own cache instead.
 */
export function createTransport(opts: TransportOptions = {}): GhTransport {
  const f = opts.fetch ?? fetch
  const revalidate = opts.revalidate ?? GITHUB_REVALIDATE
  return async (req) => {
    const headers: Record<string, string> = {
      Accept: req.accept ?? "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "wowyoy-repo-pulse",
    }
    const auth = await opts.authorization?.()
    if (auth) headers.Authorization = auth
    if (req.body) headers["Content-Type"] = "application/json"
    let res: Response
    try {
      res = await f(`${GITHUB_API}${req.path}`, {
        method: req.method ?? "GET",
        headers,
        body: req.body,
        next: { revalidate, tags: req.tags },
      } as RequestInit)
    } catch (e) {
      throw new GitHubError("offline", e instanceof Error ? e.message : "GitHub could not be reached")
    }
    const text = await res.text()
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }
    const err = classify(res.status, res.headers, data)
    if (err) throw err
    const remaining = res.headers.get("x-ratelimit-remaining")
    return { status: res.status, data, link: res.headers.get("link"), remaining: remaining == null ? null : Number(remaining) }
  }
}

/** A transport wrapper that counts requests, for the budget. */
export function counted(transport: GhTransport) {
  const state = { requests: 0, remaining: null as number | null }
  const wrapped: GhTransport = async (req) => {
    state.requests++
    const res = await transport(req)
    if (res.remaining != null) state.remaining = res.remaining
    return res
  }
  return { transport: wrapped, state }
}
