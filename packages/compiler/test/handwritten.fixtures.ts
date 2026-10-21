import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PGlite } from "@electric-sql/pglite"

/**
 * Canonical events for the hand-written spec queries, and a runner per engine: Postgres (PGlite),
 * ClickHouse (HogQL, with CLICKHOUSE_BIN) and DuckDB (BigQuery and Snowflake transpiled by sqlglot,
 * with SQLGLOT_PYTHON). Every runner returns rows as plain objects with dates as YYYY-MM-DD.
 */

export interface Ev {
  event: string
  ts: Date
  user: string | null
  session: string
  props: Record<string, unknown>
}

export type Row = Record<string, unknown>

const DAY = 864e5
const WEEK = 7 * DAY
const HOUR = 3600e3

/** Monday 00:00 UTC of the week `now` falls in. */
export function thisMonday(now = new Date()) {
  const d = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return d - ((new Date(d).getUTCDay() + 6) % 7) * DAY
}

/** The Monday `n` weeks before this one, as YYYY-MM-DD. */
export const weekAgo = (n: number, now = new Date()) => new Date(thisMonday(now) - n * WEEK).toISOString().slice(0, 10)

/** A builder for hand-made fixtures: times are given as weeks before this Monday plus an offset in hours. */
export function at(weeksAgo: number, hours = 0, now = new Date()) {
  return new Date(thisMonday(now) - weeksAgo * WEEK + hours * HOUR)
}

export const ev = (event: string, ts: Date, user: string | null, props: Record<string, unknown> = {}, session = ""): Ev => ({
  event,
  ts,
  user,
  session,
  props,
})

/**
 * Two years of a small store-and-subscription business: page views in sessions with campaign tags and
 * referrers, orders and refunds, ad spend, email, signups and trials, a subscription change log and its
 * flows, payments. Numbers sometimes arrive as numeric strings or junk ("n/a"); some events have no
 * person or no session; a few weeks have no ad spend and no subscription flows at all.
 */
export function seedEvents(now = new Date()): Ev[] {
  let seed = 11
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const int = (n: number) => Math.floor(rand() * n)
  const pick = <T>(xs: readonly T[]) => xs[int(xs.length)]!
  const mon = thisMonday(now)
  const start = mon - 90 * WEEK
  const evs: Ev[] = []
  const add = (event: string, t: number, user: string | null, props: Record<string, unknown> = {}, session = "") => {
    // Whole seconds, as most warehouses store them.
    if (t < mon + 3 * DAY) evs.push({ event, ts: new Date(Math.floor(t / 1000) * 1000), user, session, props })
  }
  const money = (v: number) => (rand() < 0.06 ? "n/a" : rand() < 0.15 ? String(v) : v)
  let orderSeq = 0
  let sessionSeq = 0

  const users = Array.from({ length: 260 }, (_, i) => ({
    id: `u${i}`,
    // Arrivals spread over the whole history, a few in the current week.
    first: start + int(92 * WEEK) + int(3600) * 1000,
    customer: rand() < 0.8 ? `c${i}` : null,
    stickiness: 0.15 + rand() * 0.6,
    orders: 0,
  }))

  for (const u of users) {
    let t = u.first
    let firstSession = true
    // Sessions until the user churns or the data ends.
    while (t < mon + 2 * DAY) {
      const sid = `s${++sessionSeq}`
      const session = rand() < 0.04 ? "" : sid
      const medium = firstSession
        ? pick([null, null, "cpc", "organic", "email", "referral", "paid_social", ""])
        : pick([null, null, null, "cpc", "email"])
      const referrer = medium
        ? pick(["$direct", "www.google.com"])
        : pick([
            "$direct",
            "www.google.com",
            "duckduckgo.com",
            "news.ycombinator.com",
            "t.co",
            "checkout.stripe.com",
            "shop.example.com",
            "blog.example.org",
          ])
      const entry: Record<string, unknown> = {
        $host: "shop.example.com",
        $referring_domain: referrer,
        $device_type: pick(["Mobile", "Desktop", "Tablet"]),
        ...(medium != null ? { utm_medium: medium } : {}),
        ...(rand() < 0.07 ? { gclid: `g${sid}` } : {}),
      }
      const anon = rand() < 0.05
      const who = anon ? null : u.id
      let s = t
      const pages = 1 + (rand() < 0.5 ? 0 : int(4))
      for (let p = 0; p < pages; p++) {
        add("$pageview", s, who, p === 0 ? entry : { $host: "shop.example.com", $referring_domain: "$direct" }, session)
        s += (2 + int(40)) * 1000
      }
      if (rand() < 0.3) add("$autocapture", s - 1000, who, {}, session)
      if (rand() < 0.25) add("product_searched", s, who, { query: "socks" }, session)
      if (rand() < 0.35) add("product_added", s + 2000, who, { product_id: "p1", quantity: 1, price: 20 }, session)
      if (rand() < 0.22) {
        add("checkout_started", s + 3000, who, {}, session)
        const total = 20 + int(180)
        const orderTs = s + 4000
        add(
          "order_completed",
          orderTs,
          who,
          {
            order_id: `o${++orderSeq}`,
            ...(u.customer ? { customer_id: u.customer } : {}),
            total: money(total),
            cost_of_goods: money(Math.round(total * 0.45)),
            is_first_order: u.orders === 0,
          },
          session
        )
        add(rand() < 0.9 ? "payment_succeeded" : "payment_failed", orderTs - 500, who, { amount: total })
        if (rand() < 0.08)
          add("order_refunded", orderTs + (1 + int(40)) * DAY, who, { order_id: `o${orderSeq}`, amount: money(Math.round(total / 2)) })
        u.orders++
      }
      if (rand() < 0.04) add("payment_failed", s + 6000, who, { amount: 10 })
      if (rand() < 0.1) add("$exception", s + 7000, who, {}, session)
      firstSession = false
      // Next visit: hours to weeks later; some people leave for good.
      if (rand() > 0.97 - (1 - u.stickiness) * 0.05) break
      t = s + (rand() < u.stickiness ? (6 + int(60)) * HOUR : (3 + int(30)) * DAY)
    }

    // Product funnel from the first visit.
    add("signed_up", u.first + 60e3, u.id, { method: "email" })
    if (rand() < 0.1) add("signed_up", u.first + 9 * DAY, u.id, { method: "google" })
    if (rand() < 0.6) add("activated", u.first + (1 + int(9 * 24)) * HOUR, u.id, { milestone: "first_report" })
    if (rand() < 0.3) add("activated", u.first + (8 + int(20)) * DAY, u.id, { milestone: "first_report" })
    if (rand() < 0.5) add("onboarding_completed", u.first + (1 + int(10 * 24)) * HOUR, u.id)
    if (rand() < 0.4) add("invite_sent", u.first + (1 + int(12 * 24)) * HOUR, u.id)

    // Trials and subscriptions: a change log per subscription, and its flows.
    if (rand() < 0.55) {
      const trial = u.first + (1 + int(5)) * DAY
      add("trial_started", trial, u.id, { plan: "pro" })
      if (rand() < 0.7) {
        const subId = `sub-${u.id}`
        let t2 = trial + (rand() < 0.75 ? int(28) : 31 + int(30)) * DAY + int(3600) * 1000
        let mrr = pick([29, 49, 99, 199])
        add("subscription_started", t2, u.id, { subscription_id: subId, mrr: money(mrr), plan: "pro" })
        add("subscription_updated", t2 + 1000, u.id, { subscription_id: subId, mrr: money(mrr), status: "active" })
        for (let k = 0; k < 6; k++) {
          t2 += (3 + int(20)) * WEEK + int(86400) * 1000
          const roll = rand()
          if (roll < 0.3) {
            const delta = pick([10, 20, 50])
            mrr += delta
            add("subscription_expanded", t2, u.id, { subscription_id: subId, mrr_delta: money(delta) })
            add("subscription_updated", t2 + 1000, u.id, { subscription_id: subId, mrr: money(mrr), status: "active" })
          } else if (roll < 0.45 && mrr > 30) {
            const delta = 10
            mrr -= delta
            add("subscription_contracted", t2, u.id, { subscription_id: subId, mrr_delta: delta })
            add("subscription_updated", t2 + 1000, u.id, { subscription_id: subId, mrr: String(mrr), status: "active" })
          } else if (roll < 0.55) {
            add("subscription_updated", t2 + 1000, u.id, { subscription_id: subId, mrr, status: "past_due" })
          } else if (roll < 0.7) {
            add("subscription_canceled", t2, u.id, { subscription_id: subId, mrr: money(mrr) })
            add("subscription_updated", t2 + 1000, u.id, { subscription_id: subId, mrr: 0, status: "canceled" })
            break
          } else {
            add("subscription_updated", t2 + 1000, u.id, { subscription_id: subId, mrr, status: "active" })
          }
        }
      }
    }
  }

  // A second subscription for a few people, so accounts and subscriptions differ.
  for (const u of users.slice(0, 12)) {
    const t = u.first + 20 * DAY
    add("subscription_started", t, u.id, { subscription_id: `sub2-${u.id}`, mrr: 15 })
    add("subscription_updated", t + 1000, u.id, { subscription_id: `sub2-${u.id}`, mrr: 15, status: "active" })
  }

  // A weekly newsletter to a sample of people; some click, some click an older one.
  for (let w = start; w < mon + 2 * DAY; w += WEEK) {
    const campaign = `nl-${(w - start) / WEEK}`
    for (const u of users) {
      if (u.first > w || rand() > 0.3) continue
      const sent = w + DAY + int(86400) * 1000
      add("email_delivered", sent, u.id, { campaign_id: campaign })
      if (rand() < 0.15) add("email_clicked", sent + int(6 * 86400) * 1000, u.id, { campaign_id: campaign })
      if (rand() < 0.02) add("email_clicked", sent, u.id, {})
    }
  }

  // Ad spend: one row per channel per day, except two weeks with none.
  for (let d = start; d < mon + 2 * DAY; d += DAY) {
    const weeksAgo = Math.floor((mon - d) / WEEK) + 1
    if (weeksAgo === 3 || weeksAgo === 60) continue
    for (const channel of ["google", "meta"]) {
      const spend = 40 + int(80)
      add("ad_spend", d + 3 * HOUR, null, {
        channel,
        spend: money(spend),
        impressions: rand() < 0.04 ? "n/a" : spend * (80 + int(40)),
        clicks: 10 + int(30),
      })
    }
  }

  // Edges: the last instant of a week, the first of the next, and late Sunday in a time zone west of UTC.
  for (const w of [1, 2, 26, 27, 52]) {
    const edge = mon - (w - 1) * WEEK
    add("$pageview", edge - 1000, "edge-a", { $host: "shop.example.com", $referring_domain: "www.google.com" }, `edge-${w}-a`)
    add("$pageview", edge, "edge-b", { $host: "shop.example.com", $referring_domain: "www.google.com" }, `edge-${w}-b`)
    add("$pageview", edge - 5 * HOUR, "edge-c", { $host: "shop.example.com", $referring_domain: "t.co", utm_medium: "cpc" }, `edge-${w}-c`)
  }

  return evs.sort((a, b) => a.ts.getTime() - b.ts.getTime())
}

const dateOnly = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10))

function normalize(rows: Row[]): Row[] {
  return rows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === "week" ? dateOnly(v) : v == null ? null : Number(v)]))
  )
}

/** Postgres: load the events into a fresh `events` table. */
export async function loadPostgres(db: PGlite, evs: Ev[], table = "events") {
  await db.exec(
    `DROP TABLE IF EXISTS ${table}; CREATE TABLE ${table} (event_name text NOT NULL, occurred_at timestamptz NOT NULL, user_id text, session_id text, properties jsonb NOT NULL)`
  )
  const rows = evs.map((e) => ({
    event_name: e.event,
    occurred_at: e.ts.toISOString(),
    user_id: e.user,
    session_id: e.session,
    properties: e.props,
  }))
  await db.query(
    `INSERT INTO ${table} SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(event_name text, occurred_at timestamptz, user_id text, session_id text, properties jsonb)`,
    [JSON.stringify(rows)]
  )
}

export async function runPostgres(db: PGlite, sql: string, timeZone: string): Promise<Row[]> {
  await db.exec(`SET TIME ZONE '${timeZone}'`)
  const res = await db.query<Row>(sql)
  return normalize(res.rows)
}

/** What PostHog's HogQL printer does with property access and toFloat, near enough to run the query. */
export function hogqlToClickhouse(sql: string) {
  const lit = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
  return sql
    .replace(/\bproperties((?:\.(?:[A-Za-z_$][A-Za-z0-9_$]*|`[^`]*`))+)/g, (_, path: string) => {
      const keys = path
        .slice(1)
        .split(".")
        .map((k) => lit(k.replace(/^`|`$/g, "")))
      return `replaceRegexpAll(nullIf(nullIf(JSONExtractRaw(properties, ${keys.join(", ")}), ''), 'null'), '^"|"$', '')`
    })
    .replace(/\btoFloat\(/g, "toFloat64OrNull(")
}

/** Events as JSON lines for ClickHouse's file() reader. */
export function writeClickhouseEvents(evs: Ev[]) {
  const file = join(mkdtempSync(join(tmpdir(), "hw-ch-")), "events.jsonl")
  const line = (e: Ev) =>
    JSON.stringify({
      event: e.event,
      ts: e.ts.toISOString().replace("T", " ").replace("Z", ""),
      person_id: e.user,
      session_id: e.session,
      properties: JSON.stringify(e.props),
    })
  writeFileSync(file, evs.map(line).join("\n") + "\n")
  return file
}

/**
 * HogQL in ClickHouse. PostHog shows `timestamp` in the project's time zone, so the column is declared
 * in one west of UTC, as is the session: a query that doesn't cut weeks in UTC gets them wrong here.
 * A LEFT JOIN's missing side reads as defaults (0, '') unless joinUseNulls, so queries must not depend on either.
 */
export function runClickhouse(
  bin: string,
  eventsFile: string,
  sql: string,
  opts: { timeZone?: string; joinUseNulls?: boolean } = {}
): Row[] {
  const timeZone = opts.timeZone ?? "America/Los_Angeles"
  const script = [
    `CREATE TABLE events (event String, timestamp DateTime64(6, '${timeZone}'), person_id Nullable(String), \`$session_id\` String, properties String) ENGINE = Memory;`,
    `INSERT INTO events SELECT event, toDateTime64(ts, 6, 'UTC'), person_id, session_id, properties FROM file('${eventsFile}', JSONEachRow, 'event String, ts String, person_id Nullable(String), session_id String, properties String');`,
    `${hogqlToClickhouse(sql)} FORMAT JSONEachRow`,
  ].join("\n")
  const res = spawnSync(
    bin,
    [
      "local",
      `--session_timezone=${timeZone}`,
      `--join_use_nulls=${opts.joinUseNulls ? 1 : 0}`,
      "--output_format_json_quote_64bit_integers=0",
      "--multiquery",
    ],
    {
      input: script,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }
  )
  if (res.status !== 0) throw new Error(res.stderr)
  return normalize(
    res.stdout
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Row)
  )
}

export interface DuckCase {
  key: string
  dialect: "bigquery" | "snowflake"
  sql: string
}

export interface DuckResult {
  rows?: Row[]
  error?: string
}

/** BigQuery and Snowflake: parsed by sqlglot in their own dialect, transpiled to DuckDB and run on the events. */
export function runDuck(python: string, evs: Ev[], cases: DuckCase[]): Record<string, DuckResult> {
  const file = join(mkdtempSync(join(tmpdir(), "hw-duck-")), "input.json")
  writeFileSync(
    file,
    JSON.stringify({
      events: evs.map((e) => ({
        event_name: e.event,
        occurred_at: e.ts.toISOString(),
        user_id: e.user,
        session_id: e.session,
        properties: JSON.stringify(e.props),
      })),
      cases,
    })
  )
  const res = spawnSync(python, ["-I", join(import.meta.dirname, "handwritten_check.py"), file], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  if (res.status !== 0) throw new Error(res.stderr)
  const out = JSON.parse(res.stdout) as Record<string, DuckResult>
  for (const r of Object.values(out)) if (r.rows) r.rows = normalize(r.rows)
  return out
}

/** Rows equal column by column: same weeks, numbers equal to a relative 1e-9 (1e-6 for medians and averages of money). */
export function sameRows(got: Row[], want: Row[], tol = 1e-9): string | null {
  if (got.length !== want.length) return `${got.length} rows, expected ${want.length}`
  for (let i = 0; i < want.length; i++) {
    const g = got[i]!
    const w = want[i]!
    for (const [k, wv] of Object.entries(w)) {
      if (!(k in g)) return `row ${i}: no column ${k}`
      const gv = g[k]
      if (k === "week") {
        if (gv !== wv) return `row ${i}: week ${String(gv)}, expected ${String(wv)}`
        continue
      }
      if (wv == null || gv == null) {
        if (wv !== gv) return `row ${i} (${String(w.week)}): ${k} ${String(gv)}, expected ${String(wv)}`
        continue
      }
      const a = Number(gv)
      const b = Number(wv)
      if (Math.abs(a - b) > tol * Math.max(1, Math.abs(b))) return `row ${i} (${String(w.week)}): ${k} ${a}, expected ${b}`
    }
  }
  return null
}
