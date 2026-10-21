import { z } from "zod"
import { FLUKE_MIN_WEEKS, flukeTest, formatFluke, parseSeries, type FlukeUnit } from "@workspace/metrics"
import { absolute } from "@workspace/compiler/site"
import { parseNumber } from "./number"
import { TokenBuckets, clientIp } from "./rate-limit"
import { plain, runTwoWeek, type TwoWeekValues } from "./two-week"

/**
 * GET/POST /api/fluke: the Fluke Test as JSON, the same answer the page renders.
 * Two numbers: {kind, before, after, volume?, cv?}, rates in percent (4.1 = 4.1%).
 * History: {values: [...] | "62.1%, 61.4%, ...", name?, unit?}.
 */

const MAX_WEEKS = 160
const MAX_BODY = 32_000

const numeric = (what: string) =>
  z.union([z.number(), z.string().max(40)], { error: `${what} must be a number` }).transform((v, ctx) => {
    const n = parseNumber(v)
    if (n == null) {
      ctx.addIssue({ code: "custom", message: `${what} must be a number, like 4.1, 1,184 or $412k` })
      return z.NEVER
    }
    return n
  })

const twoWeekSchema = z.object({
  kind: z.enum(["rate", "count", "amount", "average"], { error: "kind must be rate, count, amount or average" }),
  before: numeric("before"),
  after: numeric("after"),
  volume: numeric("volume").optional(),
  cv: numeric("cv").optional(),
})

const historySchema = z.object({
  values: z.union([z.string().max(8000), z.array(z.union([z.number(), z.string().max(40)])).max(MAX_WEEKS)], {
    error: "values must be an array of weekly numbers, oldest first",
  }),
  name: z.string().max(60).optional(),
  unit: z.enum(["%", "$", ""]).optional(),
})

export type FlukeApiResult = { status: number; body: Record<string, unknown> }

const bad = (error: string): FlukeApiResult => ({ status: 400, body: { error } })

function issue(e: z.ZodError) {
  const first = e.issues[0]
  if (!first) return "Invalid input."
  const at = first.path.join(".")
  return at && !first.message.startsWith(at) ? `${at}: ${first.message}` : first.message
}

const finite = (n: number | null) => (n == null || !Number.isFinite(n) ? null : n)

function twoWeeks(input: unknown): FlukeApiResult {
  const parsed = twoWeekSchema.safeParse(input)
  if (!parsed.success) return bad(issue(parsed.error))
  const values: TwoWeekValues = { ...parsed.data, volume: parsed.data.kind === "count" ? undefined : parsed.data.volume }
  if (values.kind !== "count" && values.volume != null) values.volume = Math.round(values.volume)
  const r = runTwoWeek(values)
  if ("error" in r) return bad(r.error)
  return {
    status: 200,
    body: {
      test: "two-weeks",
      call: r.call,
      headline: r.headline,
      reason: r.explain.map(plain).join(" "),
      caveat: r.caveat,
      change: r.change,
      floor: r.floor,
      oneInWeeks: finite(r.oneInWeeks),
      inputs: { ...values, unit: values.kind === "rate" ? "percent" : values.kind === "count" ? "count" : "currency" },
      url: absolute(r.path),
    },
  }
}

function history(input: unknown): FlukeApiResult {
  const parsed = historySchema.safeParse(input)
  if (!parsed.success) return bad(issue(parsed.error))
  const { values: raw, name } = parsed.data
  let values: number[]
  let unit: FlukeUnit
  if (typeof raw === "string") ({ values, unit } = parseSeries(raw))
  else {
    const nums = raw.map(parseNumber)
    const at = nums.findIndex((n) => n == null)
    if (at >= 0) return bad(`values.${at}: must be a number`)
    values = nums as number[]
    const text = raw.filter((x): x is string => typeof x === "string").join(" ")
    unit = /%/.test(text) ? "%" : /\$/.test(text) ? "$" : ""
  }
  unit = parsed.data.unit ?? unit
  if (values.length > MAX_WEEKS) return bad(`values: at most ${MAX_WEEKS} weeks`)
  if (values.length < FLUKE_MIN_WEEKS)
    return bad(`values: at least ${FLUKE_MIN_WEEKS} weeks, oldest first, so there's a normal range to compare against`)
  const r = flukeTest(values)
  if (!r) return bad("values: these weeks never move, so there's no normal swing to compare against")
  const q = new URLSearchParams()
  q.set("m", name ?? "Metric")
  q.set("v", values.join(","))
  if (unit) q.set("u", unit === "$" ? "usd" : "pct")
  const swingLabel = unit === "%" ? `±${r.swing < 1 ? r.swing.toFixed(2) : r.swing.toFixed(1)} pt` : `±${formatFluke(r.swing, unit)}`
  return {
    status: 200,
    body: {
      test: "history",
      call: r.call,
      headline: r.verdict,
      reason: r.advice,
      last: r.last,
      previous: r.prev,
      change: { absolute: r.change, relative: r.relativeChange },
      floor: { absolute: r.swing, relative: r.center !== 0 ? r.swing / Math.abs(r.center) : 0, label: swingLabel },
      range: r.range,
      oneInWeeks: finite(r.oneInWeeks),
      weeks: r.historyWeeks,
      inputs: { values, name: name ?? null, unit },
      url: absolute(`/fluke?${q}`),
    },
  }
}

/** Judge one request body or query: two numbers, or a history when `values` is present. */
export function flukeApi(input: unknown): FlukeApiResult {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return bad("Send a JSON object: {kind, before, after, volume} or {values: [...]}.")
  return "values" in input ? history(input) : twoWeeks(input)
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
}

const limiter = new TokenBuckets(60, 1)

function respond(r: FlukeApiResult, cache: string) {
  return Response.json(r.body, {
    status: r.status,
    headers: { ...CORS, "Cache-Control": r.status === 200 ? cache : "no-store", "X-Robots-Tag": "noindex" },
  })
}

function limited(req: Request, buckets: TokenBuckets) {
  const wait = buckets.take(clientIp(req.headers))
  if (!wait) return null
  return Response.json(
    { error: `Too many requests from this address. Try again in ${wait}s.` },
    { status: 429, headers: { ...CORS, "Cache-Control": "no-store", "Retry-After": String(wait) } },
  )
}

/** GET /api/fluke?kind=rate&volume=800&before=4.1&after=3.6, or ?values=1,2,3,... (comma separated). */
export function handleGet(req: Request, buckets = limiter) {
  const blocked = limited(req, buckets)
  if (blocked) return blocked
  const q = new URL(req.url).searchParams
  const input: Record<string, unknown> = {}
  for (const k of ["kind", "before", "after", "volume", "cv", "name", "unit"]) {
    const v = q.get(k)
    if (v != null) input[k] = v
  }
  const values = q.get("values")
  if (values != null) input.values = values.split(/[,\s]+/).filter(Boolean)
  // Same inputs, same answer: a GET can be cached by browsers and the CDN.
  return respond(flukeApi(input), "public, max-age=3600, s-maxage=86400")
}

export async function handlePost(req: Request, buckets = limiter) {
  const blocked = limited(req, buckets)
  if (blocked) return blocked
  const text = await req.text()
  if (text.length > MAX_BODY) return respond(bad("Body too large."), "no-store")
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    return respond(bad("Body must be JSON."), "no-store")
  }
  return respond(flukeApi(input), "no-store")
}

export function handleOptions() {
  return new Response(null, { status: 204, headers: CORS })
}
