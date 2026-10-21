import { allSpecs, dialects, type Dialect } from "@workspace/metrics"
import { Parser } from "node-sql-parser"
import { describe, expect, it } from "vitest"
import { QUERY_SCHEMAS, emitAll, emitQuery, schemaLine } from "../src"
import { cases, makeSpec, m } from "./fixtures"

const q = (name: keyof typeof cases, d: Dialect, opts = {}) => emitQuery(cases[name]!, d, opts)!

describe("aggregates, per dialect", () => {
  const expectations: Record<string, Record<Dialect, string[]>> = {
    count: {
      hogql: ["count() AS numerator", "event = '$pageview'"],
      postgres: ["count(*) AS numerator", "event_name = '$pageview'"],
      bigquery: ["COUNT(*) AS numerator"],
      snowflake: ["COUNT(*) AS numerator"],
    },
    countMobile: {
      hogql: ["countIf(toString(properties.$device_type) = 'Mobile')"],
      postgres: ["count(*) FILTER (WHERE properties->>'$device_type' = 'Mobile')"],
      bigquery: [`COUNTIF(JSON_VALUE(properties, '$."$device_type"') = 'Mobile')`],
      snowflake: [`COUNT_IF(properties:"$device_type"::string = 'Mobile')`],
    },
    sessions: {
      hogql: ["uniqExact(nullIf($session_id, '')) AS numerator"],
      postgres: ["count(DISTINCT nullif(session_id, '')) AS numerator"],
      bigquery: ["COUNT(DISTINCT NULLIF(session_id, '')) AS numerator"],
      snowflake: ["COUNT(DISTINCT NULLIF(session_id, '')) AS numerator"],
    },
    anyEventUsers: {
      hogql: ["uniqExact(person_id) AS numerator"],
      postgres: ["count(DISTINCT user_id) AS numerator"],
      bigquery: ["COUNT(DISTINCT user_id) AS numerator"],
      snowflake: ["COUNT(DISTINCT user_id) AS numerator"],
    },
    rate: {
      hogql: [
        "uniqExactIf(nullIf($session_id, ''), event = 'order_completed') AS numerator",
        "event IN ('order_completed', 'checkout_started')",
        "if(denominator = 0, NULL, numerator / denominator) AS value",
      ],
      postgres: [
        "count(DISTINCT nullif(session_id, '')) FILTER (WHERE event_name = 'checkout_started') AS denominator",
        "numerator::numeric / nullif(denominator, 0) AS value",
      ],
      bigquery: [
        "COUNT(DISTINCT IF(event_name = 'order_completed', NULLIF(session_id, ''), NULL))",
        "SAFE_DIVIDE(numerator, denominator) AS value",
      ],
      snowflake: [
        "COUNT(DISTINCT IFF(event_name = 'order_completed', NULLIF(session_id, ''), NULL))",
        "numerator::float / NULLIF(denominator, 0) AS value",
      ],
    },
    netRevenue: {
      hogql: ["sumIf(toFloat(properties.total), event = 'order_completed') AS numerator", "(numerator - subtract) AS value"],
      postgres: [
        "sum(CASE WHEN properties->>'total' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (properties->>'total')::numeric END) FILTER (WHERE event_name = 'order_completed')",
        "(numerator - subtract) AS value",
      ],
      bigquery: ["SUM(IF(event_name = 'order_completed', SAFE_CAST(JSON_VALUE(properties, '$.total') AS FLOAT64), NULL))"],
      snowflake: [`SUM(IFF(event_name = 'order_refunded', TRY_TO_DOUBLE(properties:"amount"::string), NULL)) AS subtract`],
    },
    netPerOrder: {
      hogql: ["if(denominator = 0, NULL, (numerator - subtract) / denominator) AS value"],
      postgres: ["(numerator - subtract)::numeric / nullif(denominator, 0) AS value"],
      bigquery: ["SAFE_DIVIDE((numerator - subtract), denominator) AS value"],
      snowflake: ["(numerator - subtract)::float / NULLIF(denominator, 0) AS value"],
    },
    firstTime: {
      hogql: ["SELECT person_id AS uid, min(timestamp) AS first_at", "LEFT JOIN (", "AS c_numerator ON c_numerator.week = w.week"],
      postgres: ["SELECT user_id AS uid, min(occurred_at) AS first_at", "AND user_id IS NOT NULL", "cohort_numerator AS ("],
      bigquery: ["LEFT JOIN cohort_numerator AS c_numerator ON c_numerator.week = w.week"],
      snowflake: ["COALESCE(c_numerator.value, 0) AS numerator"],
    },
    returningShare: {
      hogql: ["WHERE toMonday(toTimeZone(f.first_at, 'UTC')) < a.week", "INNER JOIN ("],
      postgres: [
        "WHERE date_trunc('week', f.first_at AT TIME ZONE 'UTC')::date < a.week",
        "occurred_at < date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
      ],
      bigquery: ["WHERE DATE_TRUNC(DATE(f.first_at), ISOWEEK) < a.week"],
      snowflake: ["WHERE DATEADD(day, 1 - DAYOFWEEKISO(f.first_at), f.first_at::date) < a.week"],
    },
  }
  for (const [name, byDialect] of Object.entries(expectations)) {
    for (const d of dialects) {
      it(`${name} in ${d}`, () => {
        const sql = q(name as keyof typeof cases, d)
        for (const frag of byDialect[d]) expect(sql).toContain(frag)
      })
    }
  }
})

describe("filters", () => {
  const frags: Record<string, Record<Dialect, string>> = {
    neq: {
      hogql: "(toString(properties.$device_type) IS NULL OR toString(properties.$device_type) != 'Mobile')",
      postgres: "(properties->>'$device_type' IS NULL OR properties->>'$device_type' != 'Mobile')",
      bigquery: `(JSON_VALUE(properties, '$."$device_type"') IS NULL OR`,
      snowflake: `(properties:"$device_type"::string IS NULL OR properties:"$device_type"::string != 'Mobile')`,
    },
    inList: {
      hogql: "toString(properties.utm_source) IN ('google', 'bing')",
      postgres: "properties->>'utm_source' IN ('google', 'bing')",
      bigquery: "JSON_VALUE(properties, '$.utm_source') IN ('google', 'bing')",
      snowflake: `properties:"utm_source"::string IN ('google', 'bing')`,
    },
    notIn: {
      hogql: "(toString(properties.utm_source) IS NULL OR toString(properties.utm_source) NOT IN ('google'))",
      postgres: "NOT IN ('google'))",
      bigquery: "NOT IN ('google'))",
      snowflake: "NOT IN ('google'))",
    },
    emptyIn: { hogql: "countIf(1 = 0)", postgres: "FILTER (WHERE 1 = 0)", bigquery: "COUNTIF(1 = 0)", snowflake: "COUNT_IF(1 = 0)" },
    isSet: {
      hogql: "countIf(coalesce(toString(properties.utm_source), '') != '')",
      postgres: "coalesce(properties->>'utm_source', '') != ''",
      bigquery: "COALESCE(JSON_VALUE(properties, '$.utm_source'), '') != ''",
      snowflake: `COALESCE(properties:"utm_source"::string, '') != ''`,
    },
    isNotSet: {
      hogql: "coalesce(toString(properties.utm_source), '') = ''",
      postgres: "coalesce(properties->>'utm_source', '') = ''",
      bigquery: "COALESCE(JSON_VALUE(properties, '$.utm_source'), '') = ''",
      snowflake: `COALESCE(properties:"utm_source"::string, '') = ''`,
    },
    gt: {
      hogql: "countIf(toFloat(properties.total) > 50)",
      postgres: "THEN (properties->>'total')::numeric END > 50",
      bigquery: "COUNTIF(SAFE_CAST(JSON_VALUE(properties, '$.total') AS FLOAT64) > 50)",
      snowflake: `COUNT_IF(TRY_TO_DOUBLE(properties:"total"::string) > 50)`,
    },
    gte: { hogql: ">= 50)", postgres: "END >= 50", bigquery: ">= 50)", snowflake: ">= 50)" },
    lt: { hogql: "< 50)", postgres: "END < 50", bigquery: "< 50)", snowflake: "< 50)" },
    lte: { hogql: "<= 50)", postgres: "END <= 50", bigquery: "<= 50)", snowflake: "<= 50)" },
    boolEq: {
      hogql: "toString(properties.valid) = 'true'",
      postgres: "properties->>'valid' = 'true'",
      bigquery: "JSON_VALUE(properties, '$.valid') = 'true'",
      snowflake: `properties:"valid"::string = 'true'`,
    },
    nested: {
      hogql: "toString(properties.ctx.page) = '/cart'",
      postgres: "properties #>> '{ctx,page}' = '/cart'",
      bigquery: "JSON_VALUE(properties, '$.ctx.page') = '/cart'",
      snowflake: `properties:"ctx"."page"::string = '/cart'`,
    },
    quoted: {
      hogql: String.raw`= 'it\'s \\ on'`,
      postgres: String.raw`= 'it''s \ on'`,
      bigquery: String.raw`= 'it\'s \\ on'`,
      snowflake: String.raw`= 'it''s \\ on'`,
    },
  }
  for (const [name, byDialect] of Object.entries(frags)) {
    for (const d of dialects) it(`${name} in ${d}`, () => expect(q(name as keyof typeof cases, d)).toContain(byDialect[d]))
  }

  it("refuses a comparison without a value rather than guessing one", () => {
    const spec = makeSpec({ numerator: m("count", "$pageview", { where: [{ property: "utm_source", op: "eq" }] }) })
    expect(() => emitQuery(spec, "postgres")).toThrow(/needs a single value/)
    const gt = makeSpec({ numerator: m("count", "order_completed", { where: [{ property: "total", op: "gt", value: "lots" }] }) })
    expect(() => emitQuery(gt, "bigquery")).toThrow(/needs a number/)
  })
})

describe("weeks", () => {
  it("cuts weeks at Monday 00:00 UTC in every dialect", () => {
    expect(q("count", "hogql")).toContain("toMonday(toTimeZone(timestamp, 'UTC')) AS week")
    expect(q("count", "postgres")).toContain("date_trunc('week', occurred_at AT TIME ZONE 'UTC')::date AS week")
    expect(q("count", "bigquery")).toContain("DATE_TRUNC(DATE(occurred_at), ISOWEEK) AS week")
    // Independent of the account's WEEK_START.
    expect(q("count", "snowflake")).toContain("DATEADD(day, 1 - DAYOFWEEKISO(occurred_at), occurred_at::date) AS week")
    expect(q("count", "snowflake")).not.toContain("DATE_TRUNC('week'")
    // SYSDATE is UTC; CURRENT_DATE follows the session time zone.
    expect(q("count", "snowflake")).toContain("SYSDATE()")
  })

  it("reads complete weeks only, ending last week, with a week spine so empty weeks are zeros", () => {
    const pg = q("count", "postgres", { weeks: 8 })
    expect(pg).toContain("occurred_at >= (date_trunc('week', now() AT TIME ZONE 'UTC') - interval '8 weeks') AT TIME ZONE 'UTC'")
    expect(pg).toContain("AND occurred_at < date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'")
    expect(pg).toContain("interval '1 week', interval '1 week') AS g(week)")
    expect(pg).toContain("LEFT JOIN scan AS s ON s.week = w.week")
    expect(q("count", "bigquery", { weeks: 8 })).toContain(
      "INTERVAL 8 WEEK), DATE_SUB(DATE_TRUNC(CURRENT_DATE(), ISOWEEK), INTERVAL 1 WEEK)"
    )
    expect(q("count", "snowflake", { weeks: 8 })).toContain("GENERATOR(ROWCOUNT => 8)")
    // SEQ4 can skip numbers; ROW_NUMBER can't.
    expect(q("count", "snowflake")).toContain("ROW_NUMBER() OVER (ORDER BY SEQ4())")
    const hog = q("count", "hogql", { weeks: 8 })
    expect(hog).toContain("toIntervalWeek(arrayJoin(range(1, 9)))")
    // A loose bound on the raw column lets PostHog skip old partitions; the exact one is on the UTC week.
    expect(hog).toContain("timestamp >= now() - toIntervalWeek(9)")
    expect(hog).toContain(
      "BETWEEN toMonday(toTimeZone(now(), 'UTC')) - toIntervalWeek(8) AND toMonday(toTimeZone(now(), 'UTC')) - toIntervalWeek(1)"
    )
  })

  it("orders oldest first and caps HogQL's row limit above PostHog's default of 100", () => {
    for (const d of dialects) expect(q("rate", d)).toMatch(/ORDER BY week\n?(LIMIT 10000)?;?$/)
    expect(q("rate", "hogql", { breakdown: "$device_type" })).toMatch(/ORDER BY week, segment\nLIMIT 10000$/)
  })

  it("accepts 1 to 520 weeks and nothing else", () => {
    expect(() => emitQuery(cases.count!, "postgres", { weeks: 0 })).toThrow(RangeError)
    expect(() => emitQuery(cases.count!, "postgres", { weeks: 2.5 })).toThrow(RangeError)
    expect(() => emitQuery(cases.count!, "postgres", { weeks: 521 })).toThrow(RangeError)
    expect(q("count", "postgres", { weeks: 520 })).toContain("520 weeks")
  })
})

describe("breakdowns", () => {
  it("adds a segment column, labels missing values, and drops the spine", () => {
    const pg = q("rate", "postgres", { breakdown: "$device_type" })
    expect(pg).toContain("coalesce(properties->>'$device_type', '(not set)') AS segment")
    expect(pg).toContain("ORDER BY week, segment;")
    expect(pg).not.toContain("weeks AS")
    expect(q("rate", "bigquery", { breakdown: "$device_type" })).toContain(
      `COALESCE(JSON_VALUE(properties, '$."$device_type"'), '(not set)') AS segment`
    )
  })

  it("has no form for first-time or returning measures", () => {
    for (const d of dialects) {
      expect(emitQuery(cases.firstTime!, d, { breakdown: "$device_type" })).toBeNull()
      expect(emitQuery(cases.returningShare!, d, { breakdown: "plan" })).toBeNull()
    }
  })
})

describe("every spec compiles in every dialect", () => {
  const specs = allSpecs()
  it("has specs to check", () => expect(specs.length).toBeGreaterThan(0))
  for (const spec of specs) {
    it(spec.id, () => {
      const all = emitAll(spec)
      for (const d of dialects) {
        const sql = all[d]
        expect(sql, `${spec.id} ${d}`).toBeTruthy()
        if (!spec.queries) {
          expect(sql).toContain(`-- ${spec.name}, weekly`)
          expect(sql).toMatch(/AS value\n/)
          expect(balanced(sql!)).toBe(true)
          if (d !== "hogql") expect(sql!.endsWith(";")).toBe(true)
        }
      }
      for (const drv of spec.drivers) {
        if (!drv.breakdown) continue
        const b = emitAll(spec, { breakdown: drv.breakdown })
        if (spec.queries) for (const d of dialects) expect(b[d]).toBeNull()
        else for (const d of dialects) if (b[d]) expect(b[d]).toContain("AS segment")
      }
    })
  }
})

/** Parentheses balance outside string literals and comments. */
function balanced(sql: string) {
  let depth = 0
  const body = sql.replace(/--[^\n]*/g, "").replace(/'(?:[^'\\]|\\.|'')*'/g, "''")
  for (const c of body) {
    if (c === "(") depth++
    if (c === ")" && --depth < 0) return false
  }
  return depth === 0
}

describe("SQL parsers accept every compiled shape", () => {
  // node-sql-parser 5.4 parses `col AT TIME ZONE 'UTC'` but not `<function call or (expr)> AT TIME ZONE`,
  // which is valid Postgres; the Postgres queries are instead run for real in PGlite (query.postgres.test.ts).
  const parser = new Parser()
  for (const [db, d] of [
    ["bigquery", "bigquery"],
    ["snowflake", "snowflake"],
  ] as const) {
    it(d, () => {
      for (const [name, spec] of Object.entries(cases)) {
        for (const breakdown of [undefined, "$device_type"]) {
          const sql = emitQuery(spec, d, { weeks: 8, breakdown })
          if (sql) expect(() => parser.astify(sql, { database: db }), `${name} ${breakdown ?? ""}`).not.toThrow()
        }
      }
    })
  }

  it("documents the one Postgres construct node-sql-parser can't read", () => {
    expect(() => parser.astify("SELECT date_trunc('week', now()) AT TIME ZONE 'UTC'", { database: "postgresql" })).toThrow()
    expect(() => parser.astify("SELECT count(*) FILTER (WHERE a = 1) FROM t", { database: "postgresql" })).not.toThrow()
  })
})

describe("schemas", () => {
  it("names the table and columns each dialect reads", () => {
    expect(schemaLine("postgres")).toBe("events(event_name text, occurred_at timestamptz, user_id text, session_id text, properties jsonb)")
    expect(schemaLine("snowflake")).toContain("properties VARIANT")
    expect(QUERY_SCHEMAS.hogql.columns.map((c) => c.name)).toEqual(["event", "timestamp", "person_id", "$session_id", "properties"])
    expect(q("count", "postgres")).toContain(`-- Postgres. Reads ${schemaLine("postgres")}.`)
  })
})
