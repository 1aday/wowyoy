import { PGlite } from "@electric-sql/pglite"
import { allSpecs } from "@workspace/metrics"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { emitQuery } from "../src"
import { WEEKS, cases, cleanDataset, dataset, expected, expectedBreakdown } from "./fixtures"

/**
 * The Postgres queries, run for real (PGlite is Postgres compiled to WASM) against seeded
 * events, and checked row by row against the same measures computed directly in JS.
 * The session time zone is deliberately not UTC: weeks must still be cut in UTC.
 */

const now = new Date()
const evs = dataset(now)
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    SET TIME ZONE 'America/Los_Angeles';
    CREATE TABLE events (event_name text NOT NULL, occurred_at timestamptz NOT NULL, user_id text, session_id text, properties jsonb NOT NULL);
  `)
  const rows = evs.map((e) => ({
    event_name: e.event,
    occurred_at: e.ts.toISOString(),
    user_id: e.user,
    session_id: e.session,
    properties: e.props,
  }))
  await db.query(
    `INSERT INTO events SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(event_name text, occurred_at timestamptz, user_id text, session_id text, properties jsonb)`,
    [JSON.stringify(rows)]
  )
  await db.exec("CREATE SCHEMA clean; CREATE TABLE clean.events (LIKE public.events)")
  const clean = cleanDataset(evs).map((e) => ({
    event_name: e.event,
    occurred_at: e.ts.toISOString(),
    user_id: e.user,
    session_id: e.session,
    properties: e.props,
  }))
  await db.query(
    `INSERT INTO clean.events SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(event_name text, occurred_at timestamptz, user_id text, session_id text, properties jsonb)`,
    [JSON.stringify(clean)]
  )
}, 60_000)

afterAll(async () => {
  await db?.close()
})

const n = (v: unknown) => (v == null ? null : Number(v))
const date = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10))

async function run(sql: string) {
  const res = await db.query<Record<string, unknown>>(sql)
  return res.rows
}

describe("Postgres queries return the right numbers", () => {
  for (const [name, spec] of Object.entries(cases)) {
    it(name, async () => {
      const rows = await run(emitQuery(spec, "postgres", { weeks: WEEKS })!)
      const want = expected(spec, evs, now)
      expect(rows.map((r) => date(r.week))).toEqual(want.map((r) => r.week))
      rows.forEach((r, i) => {
        const w = want[i]!
        expect(n(r.numerator)).toBeCloseTo(w.numerator, 6)
        if ("subtract" in w) expect(n(r.subtract)).toBeCloseTo(w.subtract!, 6)
        if ("denominator" in w) expect(n(r.denominator)).toBe(w.denominator)
        if (w.value == null) expect(r.value).toBeNull()
        else expect(n(r.value)).toBeCloseTo(w.value, 9)
      })
    })
  }

  it("splits by a property, one row per week and segment that had events", async () => {
    const spec = cases.rate!
    const rows = await run(emitQuery(spec, "postgres", { weeks: WEEKS, breakdown: "$device_type" })!)
    const got = rows.map((r) => ({ week: date(r.week), segment: String(r.segment), numerator: n(r.numerator), value: n(r.value) }))
    const want = expectedBreakdown(spec, evs, "$device_type", now)
    const key = (r: { week: string; segment: string }) => `${r.week}|${r.segment}`
    expect(got.map(key).sort()).toEqual(want.map(key).sort())
    for (const w of want) {
      const g = got.find((r) => key(r) === key(w))!
      expect(g.numerator).toBe(w.numerator)
      if (w.value == null) expect(g.value).toBeNull()
      else expect(g.value!).toBeCloseTo(w.value, 9)
    }
  })
})

describe("every spec's own Postgres query runs", () => {
  // Hand-written queries cast as they please, so they run on events whose numbers are clean.
  for (const spec of allSpecs()) {
    it(spec.id, async () => {
      if (spec.queries) await db.exec("SET search_path TO clean")
      try {
        const rows = await run(emitQuery(spec, "postgres", { weeks: WEEKS })!)
        // Compiled queries always return the full week spine; hand-written ones return what their data has.
        if (!spec.queries) expect(rows.length).toBe(WEEKS)
        for (const d of spec.drivers) {
          const q = d.breakdown ? emitQuery(spec, "postgres", { weeks: WEEKS, breakdown: d.breakdown }) : null
          if (q) await run(q)
        }
      } finally {
        await db.exec("SET search_path TO public")
      }
    })
  }
})
