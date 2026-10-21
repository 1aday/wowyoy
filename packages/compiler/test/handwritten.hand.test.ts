import { PGlite } from "@electric-sql/pglite"
import { allSpecs } from "@workspace/metrics"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  type Ev,
  type Row,
  at,
  ev,
  loadPostgres,
  runClickhouse,
  runDuck,
  runPostgres,
  sameRows,
  weekAgo,
  writeClickhouseEvents,
} from "./handwritten.fixtures"

/**
 * Small hand-built histories for eight hand-written spec queries, with the answers worked out by hand
 * in the comments. Each case runs in Postgres (session in UTC and in Los Angeles), and in ClickHouse
 * and DuckDB when CLICKHOUSE_BIN and SQLGLOT_PYTHON are set, and every engine must give those answers.
 */

const bin = process.env.CLICKHOUSE_BIN
const python = process.env.SQLGLOT_PYTHON
const now = new Date()
const t = (weeksAgo: number, hours = 0) => at(weeksAgo, hours, now)
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms)
const SECOND = 1000
const DAY = 864e5

interface HandCase {
  id: string
  events: Ev[]
  /** Expected columns for the week that many weeks before this Monday. */
  want: Record<number, Row>
}

const sub = (ts: Date, user: string, subscription_id: string | undefined, mrr: unknown, status: string) =>
  ev("subscription_updated", ts, user, { ...(subscription_id ? { subscription_id } : {}), mrr, status })

const order = (ts: Date, user: string, props: Record<string, unknown>) => ev("order_completed", ts, user, { total: 50, ...props })

const cases: HandCase[] = [
  {
    // MRR at the end of a week sums each live subscription's latest state before the next Monday.
    id: "mrr",
    events: [
      sub(t(10), "u1", "A", 100, "active"),
      sub(t(6, 50), "u1", "A", 150, "active"),
      sub(t(3, 24), "u1", "A", 150, "canceled"),
      sub(t(8, 12), "u2", "B", "n/a", "active"), // unreadable amount: counts as nothing
      sub(t(7, 12), "u2", "B", "80", "active"),
      sub(plus(t(5), -SECOND), "u3", "C", 40, "past_due"), // last second of the week 6 weeks ago
      sub(t(9), "u4", "D", 999, "trialing"),
      sub(t(9), "u5", undefined, 500, "active"), // no subscription id
    ],
    want: {
      11: { value: 0 }, // A's first update lands exactly on the next Monday
      10: { value: 100 },
      9: { value: 100 },
      8: { value: 100 },
      7: { value: 180 }, // A 100 + B 80
      6: { value: 270 }, // A 150 + B 80 + C 40
      4: { value: 270 }, // A cancels the week after
      3: { value: 120 },
      1: { value: 120 },
    },
  },
  {
    // Customers paying at the end of the week 52 weeks earlier: c1 100 (s1), c2 50 (s2). c3 started
    // later and c4's amount is unreadable, so neither is in the base. c1 drops to 90, adds s4 for 30
    // 5 weeks ago; c2 cancels.
    id: "net-revenue-retention",
    events: [
      sub(t(60), "c1", "s1", 100, "active"),
      sub(t(20), "c1", "s1", 90, "active"),
      sub(t(5), "c1", "s4", 30, "active"),
      sub(t(60), "c2", "s2", 50, "active"),
      sub(t(30), "c2", "s2", 50, "canceled"),
      sub(t(40), "c3", "s3", 70, "active"),
      sub(t(60), "c4", "s5", "n/a", "active"),
    ],
    want: {
      26: { numerator: 0, denominator: 0, value: null }, // nothing was paying 78 weeks ago
      8: { numerator: 90, denominator: 150, value: 0.6 },
      2: { numerator: 120, denominator: 150, value: 0.8 },
    },
  },
  {
    // Cohort of 10 weeks ago: u1, u2, u3 and u6 (first event in the last second of that week).
    // u1 is back exactly 7 days later (in), u2 exactly 14 days later (out), u3 10 days later (in).
    id: "week-1-retention",
    events: [
      ev("$pageview", t(10, 1), "u1"),
      ev("$pageview", t(10, 1 + 7 * 24), "u1"),
      ev("$pageview", t(10, 2), "u2"),
      ev("$pageview", t(10, 2 + 3 * 24), "u2"),
      ev("$pageview", t(10, 2 + 14 * 24), "u2"),
      ev("$pageview", t(10, 100), "u3"),
      ev("$pageview", t(10, 100 + 10 * 24), "u3"),
      ev("$pageview", plus(t(9), -SECOND), "u6"),
      ev("$pageview", t(10, 5), null),
      ev("$pageview", t(11, 167), "u4"),
      ev("$pageview", t(11, 167 + 8 * 24), "u4"),
    ],
    want: {
      11: { numerator: 1, denominator: 1, value: 1 },
      10: { numerator: 2, denominator: 4, value: 0.5 },
      9: { numerator: 0, denominator: 0, value: null },
    },
  },
  {
    // Person-days in UTC: u1 has two days, u2 two (either side of UTC midnight, the same day in Los
    // Angeles), u3 one in the last second of the week. Events without a person don't count.
    id: "dau",
    events: [
      ev("$pageview", t(4, 1), "u1"),
      ev("$pageview", t(4, 2), "u1"),
      ev("$pageview", t(4, 25), "u1"),
      ev("$pageview", t(4, 23.5), "u2"),
      ev("$pageview", t(4, 24.5), "u2"),
      ev("$pageview", t(4, 30), null),
      ev("$pageview", plus(t(3), -SECOND), "u3"),
      ev("$pageview", t(3), "u3"),
    ],
    want: {
      5: { person_days: 0, value: 0 },
      4: { person_days: 5, value: 5 / 7 },
      3: { person_days: 1, value: 1 / 7 },
    },
  },
  {
    // A person active in a week counts in that week and the three after it.
    id: "mau",
    events: [
      ev("$pageview", t(8, 1), "u1"),
      ev("$pageview", t(9, 167.9), "u2"),
      ev("$pageview", t(5, 10), "u3"),
      ev("$pageview", t(6, 10), "u3"),
      ev("$pageview", t(4), "u4"),
    ],
    want: {
      10: { value: 0 },
      9: { value: 1 }, // u2
      6: { value: 3 }, // u1, u2, u3
      5: { value: 2 }, // u1, u3
      4: { value: 2 }, // u3, u4
      1: { value: 1 }, // u4
    },
  },
  {
    // Sessions starting 3 weeks ago: s1 one page view (bounce), s2 two page views, s3 a click, s4 one
    // page view and 9.5 seconds long (bounce), s5 exactly 10 seconds, s8 6 seconds across the next
    // Monday (bounce). s6 has no page view and the empty session id isn't a session.
    id: "bounce-rate",
    events: [
      ev("$pageview", t(3, 1), "u1", {}, "s1"),
      ev("$pageview", t(3, 2), "u2", {}, "s2"),
      ev("$pageview", plus(t(3, 2), 5 * SECOND), "u2", {}, "s2"),
      ev("$pageview", t(3, 3), "u3", {}, "s3"),
      ev("$autocapture", plus(t(3, 3), 2 * SECOND), "u3", {}, "s3"),
      ev("$pageview", t(3, 4), "u4", {}, "s4"),
      ev("$pageleave", plus(t(3, 4), 9.5 * SECOND), "u4", {}, "s4"),
      ev("$pageview", t(3, 5), "u5", {}, "s5"),
      ev("$pageleave", plus(t(3, 5), 10 * SECOND), "u5", {}, "s5"),
      ev("$autocapture", t(3, 6), "u6", {}, "s6"),
      ev("$pageview", t(3, 7), "u7", {}, ""),
      ev("$pageview", plus(t(2), -3 * SECOND), "u8", {}, "s8"),
      ev("$pageleave", plus(t(2), 3 * SECOND), "u8", {}, "s8"),
    ],
    want: {
      3: { numerator: 3, denominator: 6, value: 0.5 },
      2: { numerator: 0, denominator: 0, value: null },
    },
  },
  {
    // First orders 20 weeks ago: c1 reorders exactly 90 days later (in), c2 only repeats its first
    // order's id (out), u3 has no customer or order ids and reorders (in), c4 reorders a second too
    // late (out), c5 orders once in the week's last second. c6 never has a first order.
    id: "second-order-rate",
    events: [
      order(t(20, 1), "u1", { customer_id: "c1", order_id: "o1", is_first_order: true }),
      order(plus(t(20, 1), 90 * DAY), "u1", { customer_id: "c1", order_id: "o2", is_first_order: false }),
      order(t(20, 2), "u2", { customer_id: "c2", order_id: "o3", is_first_order: true }),
      order(t(20, 3), "u2", { customer_id: "c2", order_id: "o3", is_first_order: true }),
      order(t(20, 5), "u3", { is_first_order: true }),
      order(t(20, 50), "u3", { is_first_order: false }),
      order(t(20, 6), "u4", { customer_id: "c4", order_id: "o5", is_first_order: true }),
      order(plus(t(20, 6), 90 * DAY + SECOND), "u4", { customer_id: "c4", order_id: "o6", is_first_order: false }),
      order(plus(t(19), -SECOND), "u5", { customer_id: "c5", order_id: "o7", is_first_order: true }),
      order(t(20, 8), "u6", { customer_id: "c6", order_id: "o8", is_first_order: false }),
      order(t(20, 9), "u6", { customer_id: "c6", order_id: "o9", is_first_order: false }),
    ],
    want: {
      21: { numerator: 0, denominator: 0, value: null },
      20: { numerator: 2, denominator: 5, value: 0.4 },
    },
  },
  {
    // Trials 8 weeks ago: u1 subscribes a second inside 30 days (in), u2 exactly 30 days later (out), u4
    // subscribed before the trial (out). u3's first trial was 12 weeks ago and it subscribes 28 days on.
    id: "trial-conversion-rate",
    events: [
      ev("trial_started", t(8, 1), "u1"),
      ev("subscription_started", plus(t(8, 1), 30 * DAY - SECOND), "u1"),
      ev("trial_started", t(8, 2), "u2"),
      ev("subscription_started", plus(t(8, 2), 30 * DAY), "u2"),
      ev("trial_started", t(12), "u3"),
      ev("trial_started", t(8, 3), "u3"),
      ev("subscription_started", t(8, 10), "u3"),
      ev("subscription_started", t(9), "u4"),
      ev("trial_started", t(8, 4), "u4"),
      ev("trial_started", t(8, 5), null),
    ],
    want: {
      12: { numerator: 1, denominator: 1, value: 1 },
      8: { numerator: 1, denominator: 3, value: 1 / 3 },
      7: { numerator: 0, denominator: 0, value: null },
    },
  },
]

/** The rows for the weeks a case names, checked against its answers. */
function check(rows: Row[], c: HandCase): string | null {
  if (rows.length !== 26) return `${rows.length} rows, expected 26`
  for (const [n, cols] of Object.entries(c.want)) {
    const week = weekAgo(Number(n), now)
    const row = rows.find((r) => r.week === week)
    if (!row) return `no row for ${week}`
    const diff = sameRows([row], [{ week, ...cols }])
    if (diff) return diff
  }
  return null
}

function queries(id: string) {
  const q = allSpecs().find((s) => s.id === id)?.queries
  if (!q) throw new Error(`${id} has no hand-written queries`)
  return q
}

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  for (const c of cases) {
    const schema = c.id.replace(/-/g, "_")
    await db.exec(`CREATE SCHEMA ${schema}`)
    await loadPostgres(db, c.events, `${schema}.events`)
  }
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe("hand-written Postgres gives the hand-computed answers", () => {
  for (const c of cases) {
    for (const tz of ["UTC", "America/Los_Angeles"]) {
      it(`${c.id} (${tz})`, async () => {
        await db.exec(`SET search_path TO ${c.id.replace(/-/g, "_")}`)
        expect(check(await runPostgres(db, queries(c.id).postgres, tz), c)).toBeNull()
      })
    }
  }
})

describe.skipIf(!bin)("hand-written HogQL gives the hand-computed answers", () => {
  for (const c of cases) {
    it(c.id, () => {
      const file = writeClickhouseEvents(c.events)
      expect(check(runClickhouse(bin!, file, queries(c.id).hogql), c)).toBeNull()
      expect(check(runClickhouse(bin!, file, queries(c.id).hogql, { joinUseNulls: true }), c)).toBeNull()
    })
  }
})

describe.skipIf(!python)("hand-written BigQuery and Snowflake give the hand-computed answers", () => {
  for (const c of cases) {
    it(c.id, () => {
      const q = queries(c.id)
      const out = runDuck(python!, c.events, [
        { key: "bigquery", dialect: "bigquery", sql: q.bigquery },
        { key: "snowflake", dialect: "snowflake", sql: q.snowflake },
      ])
      for (const key of ["bigquery", "snowflake"]) {
        const r = out[key]!
        expect(r.error ?? null).toBeNull()
        expect(check(r.rows!, c)).toBeNull()
      }
    })
  }
})
