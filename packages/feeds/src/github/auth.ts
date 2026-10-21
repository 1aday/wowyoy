import { createSign } from "node:crypto"
import { GITHUB_API } from "./client"
import type { GitHubAuthKind } from "./types"

/**
 * How Repo Pulse signs in to GitHub, best first:
 * a GitHub App installation (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID),
 * else a token (GITHUB_TOKEN), else anonymous (60 requests an hour, and no issue or PR counts).
 */
export type GitHubAuth =
  | { kind: "app"; appId: string; privateKey: string; installationId: string }
  | { kind: "token"; token: string }
  | { kind: "none" }

export function authFromEnv(env: Record<string, string | undefined> = process.env): GitHubAuth {
  const { GITHUB_APP_ID: appId, GITHUB_APP_PRIVATE_KEY: key, GITHUB_APP_INSTALLATION_ID: installationId, GITHUB_TOKEN: token } = env
  if (appId && key && installationId) return { kind: "app", appId, privateKey: normalizePem(key), installationId }
  if (token) return { kind: "token", token }
  return { kind: "none" }
}

/** Env vars flatten PEM newlines to "\n", and some hosts store the key base64-encoded. */
export function normalizePem(key: string) {
  const k = key.trim()
  if (k.includes("-----BEGIN")) return k.replace(/\\n/g, "\n").trim()
  return Buffer.from(k, "base64").toString("utf8").trim()
}

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url")

/** The GitHub App's own JWT (RS256), valid for 9 minutes from a minute ago to allow for clock drift. */
export function appJwt(appId: string, privateKey: string, now = Date.now()) {
  const iat = Math.floor(now / 1000) - 60
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = b64url(JSON.stringify({ iat, exp: iat + 600, iss: appId }))
  const signer = createSign("RSA-SHA256")
  signer.update(`${header}.${payload}`)
  return `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`
}

interface CachedToken {
  token: string
  /** ms epoch */
  expiresAt: number
}

/** Installation tokens live an hour; one per installation, shared by every request in this process. */
const tokens = new Map<string, CachedToken>()
const minting = new Map<string, Promise<CachedToken>>()
/** Refresh a token this long before GitHub expires it. */
const EARLY = 5 * 60e3

async function mint(auth: Extract<GitHubAuth, { kind: "app" }>, f: typeof fetch, now: number): Promise<CachedToken> {
  const res = await f(`${GITHUB_API}/app/installations/${auth.installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${appJwt(auth.appId, auth.privateKey, now)}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "wowyoy-repo-pulse",
    },
  })
  if (!res.ok) throw new Error(`GitHub App token request failed: ${res.status}`)
  const body = (await res.json()) as { token: string; expires_at: string }
  return { token: body.token, expiresAt: Date.parse(body.expires_at) }
}

/** Forget cached installation tokens (tests). */
export function clearTokenCache() {
  tokens.clear()
  minting.clear()
}

/**
 * The Authorization header for each request. App tokens are minted once and reused until
 * five minutes before they expire. If minting fails the read goes out anonymously rather than not at all.
 */
export function authorizer(auth: GitHubAuth, opts: { fetch?: typeof fetch; now?: () => number } = {}) {
  const f = opts.fetch ?? fetch
  const now = opts.now ?? Date.now
  const kind: GitHubAuthKind = auth.kind
  const authorization = async (): Promise<string | null> => {
    if (auth.kind === "none") return null
    if (auth.kind === "token") return `Bearer ${auth.token}`
    const cached = tokens.get(auth.installationId)
    if (cached && cached.expiresAt - EARLY > now()) return `Bearer ${cached.token}`
    let pending = minting.get(auth.installationId)
    if (!pending) {
      pending = mint(auth, f, now()).finally(() => minting.delete(auth.installationId))
      minting.set(auth.installationId, pending)
    }
    try {
      const t = await pending
      tokens.set(auth.installationId, t)
      return `Bearer ${t.token}`
    } catch (e) {
      console.error("[repo-pulse]", e instanceof Error ? e.message : e)
      return null
    }
  }
  return { kind, authorization }
}
