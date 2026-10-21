import type { Dialect, Measure, MetricSpec, SpecFilter } from "@workspace/metrics"

/**
 * Spec → weekly query, in four dialects. Every query returns one row per complete ISO week
 * (Monday start, UTC) over the last `weeks` weeks: week, the measures, and value.
 *
 * HogQL runs as is in PostHog. The warehouse dialects assume one canonical table:
 *
 *   events(event_name text, occurred_at timestamp UTC, user_id text, session_id text, properties json)
 *
 * which is what PostHog, Segment, RudderStack and Snowplow exports reduce to.
 */

export const WAREHOUSE_SCHEMA =
  "events(event_name, occurred_at, user_id, session_id, properties): one row per event, occurred_at in UTC, properties as JSON."

export interface QueryOptions {
  /** Complete weeks to return, ending last week. Default 26. */
  weeks?: number
  /** Split every row by this property (device, channel). Not available for first-time or returning measures. */
  breakdown?: string
}

interface Dia {
  table: string
  ts: string
  user: string
  session: string
  event: string
  str: (v: string) => string
  prop: (name: string) => string
  num: (name: string) => string
  week: (ts: string) => string
  window: (weeks: number, col?: string) => string
  count: (cond: string) => string
  distinct: (col: string, cond: string) => string
  sum: (expr: string, cond: string) => string
  div: (a: string, b: string) => string
  header: string
}

const sq = (v: string) => `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
const sqStd = (v: string) => `'${v.replace(/'/g, "''")}'`
const jsonPath = (name: string) => `$.${/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `"${name.replace(/"/g, '\\"')}"`}`

const dialectsImpl: Record<Dialect, Dia> = {
  hogql: {
    table: "events",
    ts: "timestamp",
    user: "person_id",
    session: "$session_id",
    event: "event",
    str: sq,
    prop: (n) => `properties.${/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n) ? n : `\`${n.replace(/`/g, "\\`")}\``}`,
    num: (n) => `toFloat(${dialectsImpl.hogql.prop(n)})`,
    week: (ts) => `toMonday(${ts})`,
    window: (w, col = "timestamp") => `${col} >= toStartOfWeek(now(), 1) - toIntervalWeek(${w}) AND ${col} < toStartOfWeek(now(), 1)`,
    count: (c) => `countIf(${c})`,
    distinct: (col, c) => `uniqIf(${col}, ${c})`,
    sum: (e, c) => `sumIf(${e}, ${c})`,
    div: (a, b) => `if(${b} > 0, ${a} / ${b}, NULL)`,
    header: "-- HogQL: paste into a PostHog SQL insight.",
  },
  postgres: {
    table: "events",
    ts: "occurred_at",
    user: "user_id",
    session: "session_id",
    event: "event_name",
    str: sqStd,
    prop: (n) => `properties->>${sqStd(n)}`,
    num: (n) => `(properties->>${sqStd(n)})::numeric`,
    week: (ts) => `date_trunc('week', ${ts})::date`,
    window: (w, col = "occurred_at") =>
      `${col} >= date_trunc('week', now()) - interval '${w} weeks' AND ${col} < date_trunc('week', now())`,
    count: (c) => `count(*) FILTER (WHERE ${c})`,
    distinct: (col, c) => `count(DISTINCT ${col}) FILTER (WHERE ${c})`,
    sum: (e, c) => `coalesce(sum(${e}) FILTER (WHERE ${c}), 0)`,
    div: (a, b) => `${a}::numeric / nullif(${b}, 0)`,
    header: `-- Postgres. Assumes ${WAREHOUSE_SCHEMA}`,
  },
  bigquery: {
    table: "events",
    ts: "occurred_at",
    user: "user_id",
    session: "session_id",
    event: "event_name",
    str: sq,
    prop: (n) => `JSON_VALUE(properties, ${sq(jsonPath(n))})`,
    num: (n) => `SAFE_CAST(JSON_VALUE(properties, ${sq(jsonPath(n))}) AS FLOAT64)`,
    week: (ts) => `DATE_TRUNC(DATE(${ts}), ISOWEEK)`,
    window: (w, col = "occurred_at") =>
      `${col} >= TIMESTAMP(DATE_SUB(DATE_TRUNC(CURRENT_DATE(), ISOWEEK), INTERVAL ${w} WEEK)) AND ${col} < TIMESTAMP(DATE_TRUNC(CURRENT_DATE(), ISOWEEK))`,
    count: (c) => `COUNTIF(${c})`,
    distinct: (col, c) => `COUNT(DISTINCT IF(${c}, ${col}, NULL))`,
    sum: (e, c) => `COALESCE(SUM(IF(${c}, ${e}, NULL)), 0)`,
    div: (a, b) => `SAFE_DIVIDE(${a}, ${b})`,
    header: `-- BigQuery. Assumes ${WAREHOUSE_SCHEMA}`,
  },
  snowflake: {
    table: "events",
    ts: "occurred_at",
    user: "user_id",
    session: "session_id",
    event: "event_name",
    str: sqStd,
    prop: (n) => `properties:${JSON.stringify(n)}::string`,
    num: (n) => `properties:${JSON.stringify(n)}::float`,
    week: (ts) => `DATE_TRUNC('week', ${ts})::date`,
    window: (w, col = "occurred_at") =>
      `${col} >= DATEADD(week, -${w}, DATE_TRUNC('week', CURRENT_DATE())) AND ${col} < DATE_TRUNC('week', CURRENT_DATE())`,
    count: (c) => `COUNT_IF(${c})`,
    distinct: (col, c) => `COUNT(DISTINCT IFF(${c}, ${col}, NULL))`,
    sum: (e, c) => `COALESCE(SUM(IFF(${c}, ${e}, NULL)), 0)`,
    div: (a, b) => `DIV0NULL(${a}, ${b})`,
    header: `-- Snowflake. Assumes WEEK_START = 1 (Monday) and ${WAREHOUSE_SCHEMA}`,
  },
}

function literal(d: Dia, v: string | number | boolean) {
  return typeof v === "string" ? d.str(v) : String(v)
}

function filterExpr(d: Dia, f: SpecFilter) {
  const p = d.prop(f.property)
  const vals = Array.isArray(f.value) ? f.value : f.value != null ? [f.value] : []
  switch (f.op) {
    case "eq":
      return `${p} = ${literal(d, String(vals[0] ?? ""))}`
    case "neq":
      return `(${p} IS NULL OR ${p} != ${literal(d, String(vals[0] ?? ""))})`
    case "in":
      return `${p} IN (${vals.map((v) => literal(d, String(v))).join(", ")})`
    case "not_in":
      return `(${p} IS NULL OR ${p} NOT IN (${vals.map((v) => literal(d, String(v))).join(", ")}))`
    case "is_set":
      return `${p} IS NOT NULL`
    case "is_not_set":
      return `${p} IS NULL`
  }
}

function condition(d: Dia, m: Measure) {
  const parts = m.event === "*" ? [] : [`${d.event} = ${d.str(m.event)}`]
  for (const f of m.where) parts.push(filterExpr(d, f))
  return parts.length ? parts.join(" AND ") : "1 = 1"
}

const simple = (m: Measure) => m.aggregate === "count" || m.aggregate === "unique_users" || m.aggregate === "unique_sessions" || m.aggregate === "sum"

function aggregate(d: Dia, m: Measure) {
  const c = condition(d, m)
  switch (m.aggregate) {
    case "count":
      return d.count(c)
    case "unique_users":
      return d.distinct(d.user, c)
    case "unique_sessions":
      return d.distinct(d.session, c)
    case "sum":
      return d.sum(d.num(m.property!), c)
    default:
      throw new Error(`${m.aggregate} is not a single-scan aggregate`)
  }
}

/** first_time_users / returning_users as a (week, value) subquery. */
function cohortSubquery(dialect: Dialect, d: Dia, m: Measure, weeks: number) {
  const c = condition(d, m)
  const firsts = `SELECT ${d.user} AS uid, min(${d.ts}) AS first_at FROM ${d.table} WHERE ${c} GROUP BY ${d.user}`
  const countAll = dialect === "hogql" ? "count()" : "count(*)"
  if (m.aggregate === "first_time_users") {
    return [
      `SELECT ${d.week("first_at")} AS week, ${countAll} AS value`,
      `FROM (${firsts}) AS f`,
      `WHERE ${d.window(weeks, "first_at")}`,
      "GROUP BY week",
    ].join("\n    ")
  }
  const active = `SELECT ${d.user} AS uid, ${d.week(d.ts)} AS week FROM ${d.table} WHERE ${c} AND ${d.window(weeks)} GROUP BY uid, week`
  return [
    `SELECT a.week AS week, count(DISTINCT a.uid) AS value`,
    `FROM (${active}) AS a`,
    `INNER JOIN (${firsts}) AS f ON f.uid = a.uid`,
    `WHERE f.first_at < a.week`,
    "GROUP BY a.week",
  ].join("\n    ")
}

const alias = (k: "numerator" | "denominator" | "subtract") => k

/**
 * The weekly query for a spec in one dialect. Hand-written spec queries win when present;
 * they have no breakdown form, so asking for one returns null.
 */
export function emitQuery(spec: MetricSpec, dialect: Dialect, opts: QueryOptions = {}): string | null {
  const weeks = opts.weeks ?? 26
  if (spec.queries) return opts.breakdown ? null : spec.queries[dialect]
  const d = dialectsImpl[dialect]
  const measures = (
    [
      ["numerator", spec.numerator],
      ["subtract", spec.subtract],
      ["denominator", spec.denominator],
    ] as const
  ).filter((e): e is readonly ["numerator" | "subtract" | "denominator", Measure] => !!e[1])
  const scan = measures.filter(([, m]) => simple(m))
  const cohorts = measures.filter(([, m]) => !simple(m))
  if (opts.breakdown && cohorts.length) return null

  const seg = opts.breakdown ? d.prop(opts.breakdown) : null
  const value = (() => {
    const num = spec.subtract ? `(m.numerator - m.subtract)` : "m.numerator"
    return spec.denominator ? d.div(num, "m.denominator") : num
  })()
  const lines: string[] = [d.header]
  const desc = `-- ${spec.name}: ${spec.definition.formula}. One row per complete week${seg ? ` and ${opts.breakdown}` : ""}, last ${weeks} weeks.`
  lines.push(desc)

  // One scan for the plain aggregates, joined to one subquery per cohort measure.
  const scanSql = scan.length
    ? [
        "SELECT",
        `    ${d.week(d.ts)} AS week,`,
        ...(seg ? [`    ${seg} AS segment,`] : []),
        scan.map(([k, m]) => `    ${aggregate(d, m)} AS ${alias(k)}`).join(",\n"),
        `  FROM ${d.table}`,
        `  WHERE ${d.window(weeks)}`,
        `  GROUP BY week${seg ? ", segment" : ""}`,
      ].join("\n")
    : null

  const parts: string[] = []
  if (scanSql) parts.push(`(\n  ${scanSql}\n) AS m`)
  const base = scanSql ? "m" : `c_${cohorts[0]?.[0]}`
  for (const [k, m] of cohorts) {
    const sub = cohortSubquery(dialect, d, m, weeks)
    const name = `c_${k}`
    if (!parts.length) parts.push(`(\n    ${sub}\n) AS ${name}`)
    else parts.push(`LEFT JOIN (\n    ${sub}\n) AS ${name} ON ${name}.week = ${base}.week`)
  }

  // Column list: when there is no scan, the first cohort subquery stands in for m.
  const ref = (k: string) => {
    if (scan.some(([s]) => s === k)) return `m.${k}`
    return `c_${k}.value`
  }
  const weekCol = `${base}.week`
  const v = value.replace(/m\.(numerator|denominator|subtract)/g, (_, k: string) => ref(k))
  const cols = [
    `  ${weekCol} AS week`,
    ...(seg ? ["  m.segment AS segment"] : []),
    ...measures.map(([k]) => `  ${ref(k)} AS ${k}`),
    `  ${v} AS value`,
  ]
  lines.push("SELECT", cols.join(",\n"), `FROM ${parts.join("\n")}`, `ORDER BY week${seg ? ", segment" : ""}`)
  return lines.join("\n") + (dialect === "hogql" ? "" : ";")
}

export function emitAll(spec: MetricSpec, opts: QueryOptions = {}): Record<Dialect, string | null> {
  return {
    hogql: emitQuery(spec, "hogql", opts),
    postgres: emitQuery(spec, "postgres", opts),
    bigquery: emitQuery(spec, "bigquery", opts),
    snowflake: emitQuery(spec, "snowflake", opts),
  }
}
