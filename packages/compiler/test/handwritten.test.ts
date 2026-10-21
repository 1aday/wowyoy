import { PGlite } from "@electric-sql/pglite"
import { allSpecs, type MetricSpec } from "@workspace/metrics"
import { Parser } from "node-sql-parser"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  type DuckResult,
  type Row,
  loadPostgres,
  runClickhouse,
  runDuck,
  runPostgres,
  sameRows,
  seedEvents,
  weekAgo,
  writeClickhouseEvents,
} from "./handwritten.fixtures"

/**
 * Every hand-written spec query, executed. Postgres runs in PGlite twice, with the session in UTC and
 * in a time zone west of it, and must return the same 26 weeks either way. HogQL runs in ClickHouse
 * (CLICKHOUSE_BIN) and BigQuery and Snowflake run in DuckDB after sqlglot parses and transpiles them
 * (SQLGLOT_PYTHON); each must return what Postgres returns, number for number. node-sql-parser must
 * read every BigQuery and Snowflake query whether or not sqlglot is there.
 */

const bin = process.env.CLICKHOUSE_BIN
const python = process.env.SQLGLOT_PYTHON
const now = new Date()
const evs = seedEvents(now)
const specs = allSpecs().filter((s): s is MetricSpec & { queries: NonNullable<MetricSpec["queries"]> } => !!s.queries)
const reference = new Map<string, Row[]>()
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await loadPostgres(db, evs)
}, 60_000)

afterAll(async () => {
  await db?.close()
})

async function postgresRows(spec: (typeof specs)[number]) {
  const cached = reference.get(spec.id)
  if (cached) return cached
  const rows = await runPostgres(db, spec.queries.postgres, "UTC")
  reference.set(spec.id, rows)
  return rows
}

const DAY = 864e5

/** The argument of every date_trunc('week' | 'day', ...) call. */
function truncated(sql: string) {
  const out: string[] = []
  for (const m of sql.matchAll(/date_trunc\('(?:week|day)', /g)) {
    let depth = 1
    let i = m.index + m[0].length
    const from = i
    for (; i < sql.length && depth; i++) depth += sql[i] === "(" ? 1 : sql[i] === ")" ? -1 : 0
    out.push(sql.slice(from, i - 1))
  }
  return out
}

describe("hand-written queries follow the dialect conventions", () => {
  it("has hand-written specs", () => expect(specs.length).toBeGreaterThan(30))
  for (const spec of specs) {
    it(spec.id, () => {
      const q = spec.queries
      for (const sql of Object.values(q)) {
        expect(sql.split("\n")[0]).toMatch(/^-- \S/)
        expect(sql).not.toMatch(/\bDIV0NULL\b/i)
      }
      // Weeks are cut in UTC: no truncation in the session or project time zone.
      for (const arg of truncated(q.postgres)) if (/occurred_at|now\(\)/.test(arg)) expect(arg).toContain("AT TIME ZONE 'UTC'")
      // Text that isn't a plain decimal reads as null, never as a cast error.
      for (const [, prop] of q.postgres.matchAll(/\(([^()]*properties[^()]*)\)::numeric/g))
        expect(q.postgres).toContain(`CASE WHEN ${prop} ~ '^-?[0-9]+`)
      expect(q.hogql).not.toMatch(/toMonday\((?!toTimeZone\()[a-z_.]*(timestamp|now\(\))/)
      expect(q.hogql).not.toMatch(/toStartOfWeek|toDate\(timestamp\)|\buniq(If)?\(/)
      expect(q.hogql).not.toMatch(/\$session_id IS NOT NULL/)
      expect(q.snowflake).not.toMatch(/DATE_TRUNC\('week'|CURRENT_DATE|properties:[^\s,)]*::(float|double|number|boolean)/i)
      expect(q.bigquery).not.toMatch(/(?<!SAFE_)CAST\(JSON_VALUE|APPROX_/)
      for (const sql of [q.postgres, q.bigquery, q.snowflake]) expect(sql).not.toMatch(/session_id IS NOT NULL/)
    })
  }
})

describe("hand-written Postgres runs and cuts weeks in UTC", () => {
  for (const spec of specs) {
    it(spec.id, async () => {
      const utc = await postgresRows(spec)
      const west = await runPostgres(db, spec.queries.postgres, "America/Los_Angeles")
      const east = await runPostgres(db, spec.queries.postgres, "Asia/Kathmandu")
      expect(sameRows(west, utc)).toBeNull()
      expect(sameRows(east, utc)).toBeNull()
      // 26 consecutive complete weeks, oldest first, with a week and a value column.
      expect(utc.length).toBe(26)
      expect(Object.keys(utc[0]!)).toEqual(expect.arrayContaining(["week", "value"]))
      const weeks = utc.map((r) => String(r.week))
      weeks.forEach((w, i) => {
        expect(new Date(`${w}T00:00:00Z`).getUTCDay()).toBe(1)
        if (i) expect(Date.parse(w) - Date.parse(weeks[i - 1]!)).toBe(7 * DAY)
      })
      expect(weeks.at(-1)! <= weekAgo(1, now)).toBe(true)
      for (const r of utc) expect(r.value === null || Number.isFinite(r.value)).toBe(true)
      // The seeded history is long enough that every metric has numbers.
      expect(utc.filter((r) => r.value !== null && r.value !== 0).length).toBeGreaterThan(5)
    })
  }
})

describe.skipIf(!bin)("hand-written HogQL returns what Postgres returns", () => {
  let file: string
  beforeAll(() => {
    file = writeClickhouseEvents(evs)
  })
  for (const spec of specs) {
    it(
      spec.id,
      async () => {
        const want = await postgresRows(spec)
        expect(sameRows(runClickhouse(bin!, file, spec.queries.hogql), want, 1e-6)).toBeNull()
        expect(sameRows(runClickhouse(bin!, file, spec.queries.hogql, { joinUseNulls: true }), want, 1e-6)).toBeNull()
      },
      30_000
    )
  }
})

describe.skipIf(!python)("hand-written BigQuery and Snowflake, run in DuckDB, return what Postgres returns", () => {
  let results: Record<string, DuckResult>
  beforeAll(() => {
    results = runDuck(
      python!,
      evs,
      specs.flatMap((s) =>
        (["bigquery", "snowflake"] as const).map((dialect) => ({ key: `${s.id}.${dialect}`, dialect, sql: s.queries[dialect] }))
      )
    )
  }, 120_000)
  for (const spec of specs) {
    for (const dialect of ["bigquery", "snowflake"] as const) {
      it(`${spec.id} ${dialect}`, async () => {
        const r = results[`${spec.id}.${dialect}`]!
        expect(r.error ?? null).toBeNull()
        expect(sameRows(r.rows!, await postgresRows(spec), 1e-6)).toBeNull()
      })
    }
  }
})

describe("node-sql-parser reads the BigQuery and Snowflake", () => {
  const parser = new Parser()
  for (const spec of specs) {
    for (const dialect of ["bigquery", "snowflake"] as const) {
      it(`${spec.id} ${dialect}`, () => {
        expect(() => parser.astify(spec.queries[dialect], { database: dialect })).not.toThrow()
      })
    }
  }
})
