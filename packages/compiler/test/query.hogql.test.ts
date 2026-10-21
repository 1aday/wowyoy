import { spawnSync } from "node:child_process"
import { allSpecs } from "@workspace/metrics"
import { describe, expect, it } from "vitest"
import { emitQuery } from "../src"
import { WEEKS, cases, dataset, expected, expectedBreakdown, type Ev } from "./fixtures"

/**
 * HogQL is PostHog's ClickHouse dialect. With a ClickHouse binary (CLICKHOUSE_BIN=/path/to/clickhouse)
 * these tests run every compiled HogQL query in `clickhouse local`, after the same rewrite PostHog
 * applies (properties.x → JSONExtractRaw, toFloat → toFloat64OrNull), and check the numbers.
 * Without the binary they are skipped; the structural HogQL checks in query.test.ts always run.
 */

const bin = process.env.CLICKHOUSE_BIN
const now = new Date()
const evs = dataset(now)

const lit = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
const ts = (d: Date) => lit(d.toISOString().replace("T", " ").replace("Z", ""))
const row = (e: Ev) =>
  `(${lit(e.event)}, ${ts(e.ts)}, ${e.user == null ? "NULL" : lit(e.user)}, ${lit(e.session)}, ${lit(JSON.stringify(e.props))})`

/** What PostHog's HogQL printer does with property access and toFloat, near enough to run the query. */
export function hogqlToClickhouse(sql: string) {
  return sql
    .replace(/properties((?:\.(?:[A-Za-z_$][A-Za-z0-9_$]*|`[^`]*`))+)/g, (_, path: string) => {
      const keys = path
        .slice(1)
        .split(".")
        .map((k) => lit(k.replace(/^`|`$/g, "")))
      return `replaceRegexpAll(nullIf(nullIf(JSONExtractRaw(properties, ${keys.join(", ")}), ''), 'null'), '^"|"$', '')`
    })
    .replace(/\btoFloat\(/g, "toFloat64OrNull(")
}

function run(sql: string): Record<string, unknown>[] {
  const script = [
    "CREATE TABLE events (event String, timestamp DateTime64(6, 'UTC'), person_id Nullable(String), `$session_id` String, properties String) ENGINE = Memory;",
    `INSERT INTO events VALUES ${evs.map(row).join(",\n")};`,
    `${hogqlToClickhouse(sql)} FORMAT JSONEachRow`,
  ].join("\n")
  const res = spawnSync(
    bin!,
    ["local", "--session_timezone=America/Los_Angeles", "--output_format_json_quote_64bit_integers=0", "--multiquery"],
    {
      input: script,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }
  )
  if (res.status !== 0) throw new Error(`${res.stderr}\n--- query ---\n${sql}`)
  return res.stdout
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>)
}

const n = (v: unknown) => (v == null ? null : Number(v))

describe.skipIf(!bin)("HogQL queries run in ClickHouse and return the right numbers", () => {
  for (const [name, spec] of Object.entries(cases)) {
    // PostHog strips quotes from the raw JSON but leaves escapes, so a backslash in a value can't match; skip only its numbers.
    it(name, () => {
      const rows = run(emitQuery(spec, "hogql", { weeks: WEEKS })!)
      if (name === "quoted") return
      const want = expected(spec, evs, now)
      expect(rows.map((r) => String(r.week))).toEqual(want.map((r) => r.week))
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

  it("splits by a property", () => {
    const spec = cases.rate!
    const rows = run(emitQuery(spec, "hogql", { weeks: WEEKS, breakdown: "$device_type" })!)
    const key = (r: Record<string, unknown>) => `${String(r.week)}|${String(r.segment)}`
    const want = expectedBreakdown(spec, evs, "$device_type", now)
    expect(rows.map(key).sort()).toEqual(want.map(key).sort())
    for (const w of want) {
      const g = rows.find((r) => key(r) === key(w))!
      expect(n(g.numerator)).toBe(w.numerator)
      if (w.value == null) expect(g.value).toBeNull()
      else expect(n(g.value)!).toBeCloseTo(w.value, 9)
    }
  })

  it("parses and runs every spec's own HogQL", () => {
    for (const spec of allSpecs()) {
      const rows = run(emitQuery(spec, "hogql", { weeks: WEEKS })!)
      if (!spec.queries) expect(rows.length, spec.id).toBe(WEEKS)
      for (const d of spec.drivers) {
        const q = d.breakdown ? emitQuery(spec, "hogql", { weeks: WEEKS, breakdown: d.breakdown }) : null
        if (q) run(q)
      }
    }
  })
})
