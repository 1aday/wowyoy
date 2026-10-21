import { deriveMetrics, type MeasureWeek, type MetricWeek } from "@workspace/metrics"
import { completeWeeks, discoveryQuery, newCustomersQuery, sampleQuery, weeklyQuery, type WeekWindow } from "./hogql"
import type { Mapping } from "./mapping"

export interface PostHogConfig {
  host: string
  /** Project id, or "@current" for the key's current project. */
  projectId: string
  apiKey: string
}

export interface ProjectInfo {
  id: string
  name: string
  timezone: string
}

export interface DiscoveredEvent {
  event: string
  events: number
  sessions: number
  /** Property keys seen on recent events, numeric ones flagged. */
  properties?: { key: string; numeric: boolean; example?: string }[]
}

export class PostHogError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "PostHogError"
  }
}

export const posthogHosts = {
  us: "https://us.posthog.com",
  eu: "https://eu.posthog.com",
} as const

/**
 * Only https hosts on the public internet, unless the deployment opts in (self-hosting on a
 * private network, or tests). Keeps a hosted wowyoy from being pointed at internal addresses.
 */
export function normalizeHost(raw: string, allowPrivate = false) {
  let url: URL
  try {
    url = new URL(/^https?:\/\//.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`)
  } catch {
    throw new PostHogError("That host isn't a valid URL.")
  }
  const h = url.hostname
  const privateHost =
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h.startsWith("[")
  if (!allowPrivate && (url.protocol !== "https:" || privateHost)) {
    throw new PostHogError("Use your PostHog's public https address.")
  }
  if (h === "app.posthog.com") return posthogHosts.us
  return `${url.protocol}//${url.host}`
}

const TIMEOUT = 25_000

async function call<T>(cfg: PostHogConfig, path: string, init?: { body?: unknown }): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
  let res: Response
  try {
    res = await fetch(`${cfg.host}/api/projects/${encodeURIComponent(cfg.projectId).replace("%40", "@")}${path}`, {
      method: init?.body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    })
  } catch (e) {
    throw new PostHogError(
      (e as Error).name === "AbortError" ? "PostHog took too long to answer. Try again in a minute." : `Couldn't reach ${cfg.host}.`,
    )
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    let detail = ""
    try {
      detail = (JSON.parse(text) as { detail?: string }).detail ?? ""
    } catch {
      detail = text.slice(0, 200)
    }
    if (res.status === 401) throw new PostHogError("PostHog didn't accept that key. Use a personal API key (it starts with phx_).", 401)
    if (res.status === 403)
      throw new PostHogError("That key can't read this project. Give it the Project: read and Query: read scopes.", 403)
    if (res.status === 404) throw new PostHogError("No project with that id on this host. Check the region and the project id.", 404)
    if (res.status === 429) throw new PostHogError("PostHog is rate limiting this key. Try again in a minute.", 429)
    throw new PostHogError(detail ? `PostHog said: ${detail}` : `PostHog returned ${res.status}.`, res.status)
  }
  return (await res.json()) as T
}

interface QueryResponse {
  results: unknown[][]
  columns?: string[]
}

export async function hogql(cfg: PostHogConfig, query: string, name = "wowyoy") {
  const r = await call<QueryResponse>(cfg, "/query/", { body: { query: { kind: "HogQLQuery", query }, name } })
  return r.results ?? []
}

export async function getProject(cfg: PostHogConfig): Promise<ProjectInfo> {
  const p = await call<{ id: number | string; name?: string; timezone?: string }>(cfg, "/")
  return { id: String(p.id), name: p.name || `Project ${p.id}`, timezone: p.timezone || "UTC" }
}

function propsOf(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

/** What the project tracks: events by 30-day volume, with property keys for the likely funnel events. */
export async function discover(cfg: PostHogConfig, inspect = 12): Promise<DiscoveredEvent[]> {
  const rows = await hogql(cfg, discoveryQuery, "wowyoy discover events")
  const events: DiscoveredEvent[] = rows.map((r) => ({ event: String(r[0]), events: Number(r[1]) || 0, sessions: Number(r[2]) || 0 }))
  // Custom events (not PostHog's own $autocapture etc.) are where orders and carts live.
  const worth = events.filter((e) => !e.event.startsWith("$") || e.event === "$pageview" || e.event === "$screen").slice(0, inspect)
  await Promise.all(
    worth.map(async (e) => {
      try {
        const samples = await hogql(cfg, sampleQuery(e.event), "wowyoy sample properties")
        const seen = new Map<string, { numeric: boolean; example?: string }>()
        for (const s of samples) {
          for (const [k, v] of Object.entries(propsOf(s[0]))) {
            if (k.startsWith("$") && !["$current_url", "$pathname", "$screen_name", "$revenue"].includes(k)) continue
            const numeric = typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
            const prev = seen.get(k)
            seen.set(k, { numeric: (prev?.numeric ?? true) && numeric, example: prev?.example ?? (v == null ? undefined : String(v).slice(0, 60)) })
          }
        }
        e.properties = [...seen.entries()].slice(0, 40).map(([key, x]) => ({ key, ...x }))
      } catch {
        e.properties = []
      }
    }),
  )
  return events
}

const num = (v: unknown) => (v == null || v === "" ? undefined : Number(v))

/** Read weekly measures for the window and derive the canonical metrics. Weeks with no data are dropped from the front. */
export async function weeklySeries(cfg: PostHogConfig, mapping: Mapping, window: WeekWindow = completeWeeks(105)): Promise<MetricWeek[]> {
  const q = weeklyQuery(mapping, window)
  if (!q) return []
  const [main, firsts] = await Promise.all([
    hogql(cfg, q, "wowyoy weekly read"),
    mapping.orders && mapping.newCustomers ? hogql(cfg, newCustomersQuery(mapping.orders, window), "wowyoy new customers") : Promise.resolve([]),
  ])
  const byWeek = new Map<string, MeasureWeek>()
  const cols = ["sessions", "product_views", "carts", "checkouts", "orders", "revenue", "spend"] as const
  const present = cols.filter((c) => mapping[c])
  for (const r of main) {
    const week = String(r[0]).slice(0, 10)
    const m: MeasureWeek = { week }
    present.forEach((c, k) => {
      m[c] = num(r[k + 1])
    })
    byWeek.set(week, m)
  }
  for (const r of firsts) {
    const week = String(r[0]).slice(0, 10)
    const m = byWeek.get(week)
    if (m) m.new_customers = num(r[1])
  }
  // Fill every Monday in the window so comparisons line up even across empty weeks.
  const out: MetricWeek[] = []
  const start = Date.parse(`${window.from}T00:00:00Z`)
  const end = Date.parse(`${window.to}T00:00:00Z`)
  let started = false
  for (let t = start; t < end; t += 7 * 864e5) {
    const week = new Date(t).toISOString().slice(0, 10)
    const m = byWeek.get(week)
    if (!m && !started) continue
    started = true
    const filled: MeasureWeek = m ?? { week, ...Object.fromEntries(present.map((c) => [c, 0])) }
    if (mapping.orders && mapping.newCustomers && filled.orders != null && filled.new_customers == null) filled.new_customers = 0
    out.push(deriveMetrics(filled))
  }
  return out
}
