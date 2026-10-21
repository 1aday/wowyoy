import type { Dialect, Measure, MetricSpec, SpecFilter } from "@workspace/metrics"

/**
 * Spec → weekly query, in four dialects. Every compiled query returns one row per complete
 * week (Monday 00:00 UTC to Monday 00:00 UTC) over the last `weeks` weeks, oldest first:
 * week, the measures, and value. Weeks with no events still get a row, with zeros.
 *
 * HogQL runs as is in PostHog. The warehouse dialects assume one canonical table:
 *
 *   events(event_name text, occurred_at timestamp UTC, user_id text, session_id text, properties json)
 *
 * which is what PostHog, Segment, RudderStack and Snowplow exports reduce to.
 * A dotted property name ("context.page") reads a nested JSON path in every dialect.
 */

export const WAREHOUSE_SCHEMA =
  "events(event_name, occurred_at, user_id, session_id, properties): one row per event, occurred_at in UTC, properties as JSON."

export interface SchemaColumn {
  name: string
  type: string
  description: string
}

/** The table each dialect's query reads, column by column. */
export interface QuerySchema {
  table: string
  columns: SchemaColumn[]
  notes: string
}

const warehouseColumns = (types: [string, string, string, string, string]): SchemaColumn[] => [
  { name: "event_name", type: types[0], description: "Canonical event name, e.g. order_completed." },
  { name: "occurred_at", type: types[1], description: "When the event happened, in UTC." },
  { name: "user_id", type: types[2], description: "Stable person id; null for events with no known person." },
  { name: "session_id", type: types[3], description: "Session id; null or empty for server-side events." },
  { name: "properties", type: types[4], description: "Event properties as a JSON object." },
]

export const QUERY_SCHEMAS: Record<Dialect, QuerySchema> = {
  hogql: {
    table: "events",
    columns: [
      { name: "event", type: "String", description: "Event name." },
      { name: "timestamp", type: "DateTime64", description: "When the event happened." },
      { name: "person_id", type: "UUID", description: "The person, after identity merges." },
      { name: "$session_id", type: "String", description: "Session id; empty for server-side events." },
      { name: "properties", type: "JSON", description: "Event properties, read as properties.<name>." },
    ],
    notes: "PostHog's own events table. Paste into a SQL insight; nothing to set up.",
  },
  postgres: {
    table: "events",
    columns: warehouseColumns(["text", "timestamptz", "text", "text", "jsonb (or json)"]),
    notes: "Weeks are cut in UTC whatever the session time zone.",
  },
  bigquery: {
    table: "events",
    columns: warehouseColumns(["STRING", "TIMESTAMP", "STRING", "STRING", "JSON (or STRING holding JSON)"]),
    notes: "Partition on DATE(occurred_at) and the window prunes to the weeks read.",
  },
  snowflake: {
    table: "events",
    columns: warehouseColumns(["VARCHAR", "TIMESTAMP_NTZ (UTC)", "VARCHAR", "VARCHAR", "VARIANT"]),
    notes: "Weeks start Monday whatever WEEK_START is set to.",
  },
}

const dialectLabel: Record<Dialect, string> = { hogql: "HogQL", postgres: "Postgres", bigquery: "BigQuery", snowflake: "Snowflake" }

/** "events(event_name text, occurred_at timestamptz, ...)" */
export function schemaLine(dialect: Dialect) {
  const s = QUERY_SCHEMAS[dialect]
  return `${s.table}(${s.columns.map((c) => `${c.name} ${c.type.replace(/ \(.*\)$/, "")}`).join(", ")})`
}

export interface QueryOptions {
  /** Complete weeks to return, ending last week. Default 26. */
  weeks?: number
  /** Split every row by this property (device, channel). Not available for first-time or returning measures. */
  breakdown?: string
}

type MeasureKey = "numerator" | "subtract" | "denominator"

interface Dia {
  ts: string
  user: string
  event: string
  /** The distinct-session expression: empty ids are not sessions. */
  session: string
  str: (v: string) => string
  /** A property as text. */
  text: (name: string) => string
  /** A property as a number; null when it isn't one. */
  num: (name: string) => string
  /** The Monday (a date) of the UTC week a timestamp falls in. */
  week: (ts: string) => string
  /** Predicates on a raw timestamp: inside the `n` complete weeks before this one. */
  inWindow: (col: string, n: number) => string[]
  /** Predicate on a raw timestamp: before this week started. */
  beforeThisWeek: (col: string) => string
  /** A one-column (week) relation of the `n` complete weeks before this one. */
  spine: (n: number) => string
  count: (cond: string | null) => string
  distinct: (col: string, cond: string | null) => string
  sum: (expr: string, cond: string | null) => string
  countAll: string
  coalesce: string
  /** a ÷ b, null when b is 0. */
  div: (a: string, b: string) => string
  /** Compose named relations into one statement: CTEs, or nested subqueries where CTEs are unproven. */
  ctes: boolean
  limit: string | null
  end: string
}

const sqBackslash = (v: string) => `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
const sqStandard = (v: string) => `'${v.replace(/'/g, "''")}'`
const sqSnowflake = (v: string) => `'${v.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`

const plainKey = /^[A-Za-z_][A-Za-z0-9_]*$/
const segments = (name: string) => name.split(".").filter(Boolean)
const and = (parts: string[]) => (parts.length ? parts.join(" AND ") : null)
const whereClause = (preds: string[]) => `WHERE ${preds.join("\n  AND ")}`

const hogIdent = (k: string) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : `\`${k.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``)
const hogProp = (name: string) => `properties.${segments(name).map(hogIdent).join(".")}`
const hogThisWeek = "toMonday(toTimeZone(now(), 'UTC'))"
const hogWeek = (ts: string) => `toMonday(toTimeZone(${ts}, 'UTC'))`

const pgThisWeek = "date_trunc('week', now() AT TIME ZONE 'UTC')"
const pgPath = (name: string) => {
  const s = segments(name)
  return s.length === 1 ? `properties->>${sqStandard(s[0]!)}` : `properties #>> ${sqStandard(`{${s.join(",")}}`)}`
}

const bqThisWeek = "DATE_TRUNC(CURRENT_DATE(), ISOWEEK)"
// BigQuery JSONPath: quote any key that isn't a plain identifier ("$device_type" included).
const bqPath = (name: string) =>
  `$${segments(name)
    .map((k) => (plainKey.test(k) ? `.${k}` : `."${k}"`))
    .join("")}`

const sfThisWeek = "DATEADD(day, 1 - DAYOFWEEKISO(SYSDATE()), SYSDATE()::date)"
const sfPath = (name: string) =>
  `properties:${segments(name)
    .map((k) => `"${k}"`)
    .join(".")}`

const dialectsImpl: Record<Dialect, Dia> = {
  hogql: {
    ts: "timestamp",
    user: "person_id",
    event: "event",
    session: "nullIf($session_id, '')",
    str: sqBackslash,
    text: (n) => `toString(${hogProp(n)})`,
    num: (n) => `toFloat(${hogProp(n)})`,
    week: hogWeek,
    // The first bound is loose and on the raw column so PostHog can prune by date; the second is exact.
    inWindow: (col, n) => [
      `${col} >= now() - toIntervalWeek(${n + 1})`,
      `${hogWeek(col)} BETWEEN ${hogThisWeek} - toIntervalWeek(${n}) AND ${hogThisWeek} - toIntervalWeek(1)`,
    ],
    beforeThisWeek: (col) => `${hogWeek(col)} < ${hogThisWeek}`,
    spine: (n) => `SELECT ${hogThisWeek} - toIntervalWeek(arrayJoin(range(1, ${n + 1}))) AS week`,
    count: (c) => (c ? `countIf(${c})` : "count()"),
    distinct: (col, c) => (c ? `uniqExactIf(${col}, ${c})` : `uniqExact(${col})`),
    sum: (e, c) => (c ? `sumIf(${e}, ${c})` : `sum(${e})`),
    countAll: "count()",
    coalesce: "coalesce",
    div: (a, b) => `if(${b} = 0, NULL, ${a} / ${b})`,
    ctes: false,
    limit: "LIMIT 10000",
    end: "",
  },
  postgres: {
    ts: "occurred_at",
    user: "user_id",
    event: "event_name",
    session: "nullif(session_id, '')",
    str: sqStandard,
    text: pgPath,
    // Text that isn't a plain decimal reads as null, as SAFE_CAST, TRY_TO_DOUBLE and HogQL's toFloat do.
    num: (n) => `CASE WHEN ${pgPath(n)} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${pgPath(n)})::numeric END`,
    week: (ts) => `date_trunc('week', ${ts} AT TIME ZONE 'UTC')::date`,
    inWindow: (col, n) => [
      `${col} >= (${pgThisWeek} - interval '${n} weeks') AT TIME ZONE 'UTC'`,
      `${col} < ${pgThisWeek} AT TIME ZONE 'UTC'`,
    ],
    beforeThisWeek: (col) => `${col} < ${pgThisWeek} AT TIME ZONE 'UTC'`,
    spine: (n) =>
      [
        "SELECT g.week::date AS week",
        `FROM generate_series(${pgThisWeek} - interval '${n} weeks', ${pgThisWeek} - interval '1 week', interval '1 week') AS g(week)`,
      ].join("\n"),
    count: (c) => (c ? `count(*) FILTER (WHERE ${c})` : "count(*)"),
    distinct: (col, c) => (c ? `count(DISTINCT ${col}) FILTER (WHERE ${c})` : `count(DISTINCT ${col})`),
    sum: (e, c) => (c ? `sum(${e}) FILTER (WHERE ${c})` : `sum(${e})`),
    countAll: "count(*)",
    coalesce: "coalesce",
    div: (a, b) => `${a}::numeric / nullif(${b}, 0)`,
    ctes: true,
    limit: null,
    end: ";",
  },
  bigquery: {
    ts: "occurred_at",
    user: "user_id",
    event: "event_name",
    session: "NULLIF(session_id, '')",
    str: sqBackslash,
    text: (n) => `JSON_VALUE(properties, ${sqBackslash(bqPath(n))})`,
    num: (n) => `SAFE_CAST(JSON_VALUE(properties, ${sqBackslash(bqPath(n))}) AS FLOAT64)`,
    week: (ts) => `DATE_TRUNC(DATE(${ts}), ISOWEEK)`,
    inWindow: (col, n) => [`${col} >= TIMESTAMP(DATE_SUB(${bqThisWeek}, INTERVAL ${n} WEEK))`, `${col} < TIMESTAMP(${bqThisWeek})`],
    beforeThisWeek: (col) => `${col} < TIMESTAMP(${bqThisWeek})`,
    spine: (n) =>
      [
        "SELECT week",
        `FROM UNNEST(GENERATE_DATE_ARRAY(DATE_SUB(${bqThisWeek}, INTERVAL ${n} WEEK), DATE_SUB(${bqThisWeek}, INTERVAL 1 WEEK), INTERVAL 1 WEEK)) AS week`,
      ].join("\n"),
    count: (c) => (c ? `COUNTIF(${c})` : "COUNT(*)"),
    distinct: (col, c) => (c ? `COUNT(DISTINCT IF(${c}, ${col}, NULL))` : `COUNT(DISTINCT ${col})`),
    sum: (e, c) => (c ? `SUM(IF(${c}, ${e}, NULL))` : `SUM(${e})`),
    countAll: "COUNT(*)",
    coalesce: "COALESCE",
    div: (a, b) => `SAFE_DIVIDE(${a}, ${b})`,
    ctes: true,
    limit: null,
    end: ";",
  },
  snowflake: {
    ts: "occurred_at",
    user: "user_id",
    event: "event_name",
    session: "NULLIF(session_id, '')",
    str: sqSnowflake,
    text: (n) => `${sfPath(n)}::string`,
    num: (n) => `TRY_TO_DOUBLE(${sfPath(n)}::string)`,
    week: (ts) => `DATEADD(day, 1 - DAYOFWEEKISO(${ts}), ${ts}::date)`,
    inWindow: (col, n) => [`${col} >= DATEADD(week, -${n}, ${sfThisWeek})`, `${col} < ${sfThisWeek}`],
    beforeThisWeek: (col) => `${col} < ${sfThisWeek}`,
    spine: (n) =>
      [
        `SELECT DATEADD(week, -1 * ROW_NUMBER() OVER (ORDER BY SEQ4()), ${sfThisWeek}) AS week`,
        `FROM TABLE(GENERATOR(ROWCOUNT => ${n}))`,
      ].join("\n"),
    count: (c) => (c ? `COUNT_IF(${c})` : "COUNT(*)"),
    distinct: (col, c) => (c ? `COUNT(DISTINCT IFF(${c}, ${col}, NULL))` : `COUNT(DISTINCT ${col})`),
    sum: (e, c) => (c ? `SUM(IFF(${c}, ${e}, NULL))` : `SUM(${e})`),
    countAll: "COUNT(*)",
    coalesce: "COALESCE",
    div: (a, b) => `${a}::float / NULLIF(${b}, 0)`,
    ctes: true,
    limit: null,
    end: ";",
  },
}

const scalar = (v: unknown): string | number | boolean | null =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : null

function filterExpr(d: Dia, f: SpecFilter): string {
  const p = d.text(f.property)
  const list = (Array.isArray(f.value) ? f.value : f.value == null ? [] : [f.value]).map((v) => d.str(String(v)))
  const one = () => {
    const v = scalar(f.value)
    if (v == null) throw new Error(`filter ${f.op} on ${f.property} needs a single value`)
    return d.str(String(v))
  }
  // Text comparisons: JSON true reads as 'true', 5 as '5', in every dialect.
  switch (f.op) {
    case "eq":
      return `${p} = ${one()}`
    case "neq":
      return `(${p} IS NULL OR ${p} != ${one()})`
    case "in":
      return list.length ? `${p} IN (${list.join(", ")})` : "1 = 0"
    case "not_in":
      return list.length ? `(${p} IS NULL OR ${p} NOT IN (${list.join(", ")}))` : "1 = 1"
    case "is_set":
      return `${d.coalesce}(${p}, '') != ''`
    case "is_not_set":
      return `${d.coalesce}(${p}, '') = ''`
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const n = Number(scalar(f.value))
      if (!Number.isFinite(n)) throw new Error(`filter ${f.op} on ${f.property} needs a number`)
      return `${d.num(f.property)} ${{ gt: ">", gte: ">=", lt: "<", lte: "<=" }[f.op]} ${n}`
    }
  }
}

/** The predicate that picks a measure's events; null means every event. `scanEvents` already filters by event. */
function condition(d: Dia, m: Measure, scanEvents: readonly string[] | null = null) {
  const parts: string[] = []
  if (m.event !== "*" && !(scanEvents?.length === 1 && scanEvents[0] === m.event)) parts.push(`${d.event} = ${d.str(m.event)}`)
  for (const f of m.where) parts.push(filterExpr(d, f))
  return and(parts)
}

const isCohort = (m: Measure) => m.aggregate === "first_time_users" || m.aggregate === "returning_users"

function aggregate(d: Dia, m: Measure, scanEvents: readonly string[] | null) {
  const c = condition(d, m, scanEvents)
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

const indent = (s: string, by = "  ") =>
  s
    .split("\n")
    .map((l) => (l ? by + l : l))
    .join("\n")

/** First-time or returning people per week, as a (week, value) relation. */
function cohortSql(d: Dia, m: Measure, weeks: number) {
  const cond = condition(d, m)
  const where = (extra: string[]) => whereClause([...(cond ? [cond] : []), `${d.user} IS NOT NULL`, ...extra])
  const firsts = (extra: string[]) =>
    [`SELECT ${d.user} AS uid, min(${d.ts}) AS first_at`, "FROM events", where(extra), `GROUP BY ${d.user}`].join("\n")
  if (m.aggregate === "first_time_users") {
    return [
      `SELECT ${d.week("f.first_at")} AS week, ${d.countAll} AS value`,
      `FROM (\n${indent(firsts([]))}\n) AS f`,
      whereClause(d.inWindow("f.first_at", weeks)),
      `GROUP BY ${d.week("f.first_at")}`,
    ].join("\n")
  }
  const active = [
    `SELECT ${d.user} AS uid, ${d.week(d.ts)} AS week`,
    "FROM events",
    where(d.inWindow(d.ts, weeks)),
    `GROUP BY ${d.user}, ${d.week(d.ts)}`,
  ].join("\n")
  return [
    `SELECT a.week AS week, ${d.countAll} AS value`,
    `FROM (\n${indent(active)}\n) AS a`,
    `INNER JOIN (\n${indent(firsts([d.beforeThisWeek(d.ts)]))}\n) AS f ON f.uid = a.uid`,
    `WHERE ${d.week("f.first_at")} < a.week`,
    "GROUP BY a.week",
  ].join("\n")
}

function describeMeasure(k: MeasureKey, m: Measure) {
  const what = {
    count: "events",
    unique_users: "distinct people with",
    unique_sessions: "distinct sessions with",
    sum: `sum of ${m.property} over`,
    first_time_users: "people whose first ever",
    returning_users: "people with",
  }[m.aggregate]
  const ev = m.event === "*" ? "any event" : m.event
  const tail =
    m.aggregate === "first_time_users"
      ? `${ev} is that week`
      : m.aggregate === "returning_users"
        ? `${ev} that week and in an earlier week`
        : m.aggregate === "count"
          ? `(${ev})`
          : ev
  const filters = m.where.length
    ? `, where ${m.where.map((f) => `${f.property} ${f.op}${f.value == null ? "" : ` ${JSON.stringify(f.value)}`}`).join(" and ")}`
    : ""
  return `${k}: ${m.label} = ${what} ${tail}${filters}`
}

/** Compose named relations: CTEs for the warehouses, nested subqueries for HogQL. */
function compose(d: Dia, rels: [string, string][], final: (from: (name: string) => string) => string) {
  if (d.ctes) {
    const withs = rels.map(([name, sql]) => `${name} AS (\n${indent(sql)}\n)`).join(",\n")
    return `WITH ${withs}\n${final((name) => name)}`
  }
  const bodies = new Map(rels)
  const inline = (name: string): string => {
    let sql = bodies.get(name)!
    // A relation may name earlier ones; inline them in place.
    for (const [other] of rels) if (other !== name && sql.includes(`{${other}}`)) sql = sql.split(`{${other}}`).join(inline(other))
    return `(\n${indent(sql)}\n)`
  }
  return final(inline)
}

/**
 * The weekly query for a spec in one dialect. Hand-written spec queries win when present;
 * they have no breakdown form, so asking for one returns null, as does a breakdown of a
 * first-time or returning measure.
 */
export function emitQuery(spec: MetricSpec, dialect: Dialect, opts: QueryOptions = {}): string | null {
  const weeks = opts.weeks ?? 26
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 520) throw new RangeError(`weeks must be a whole number from 1 to 520, got ${weeks}`)
  if (spec.queries) return opts.breakdown ? null : spec.queries[dialect]
  const d = dialectsImpl[dialect]
  const measures = (
    [
      ["numerator", spec.numerator],
      ["subtract", spec.subtract],
      ["denominator", spec.denominator],
    ] as const
  ).filter((e): e is readonly [MeasureKey, Measure] => !!e[1])
  const scan = measures.filter(([, m]) => !isCohort(m))
  const cohorts = measures.filter(([, m]) => isCohort(m))
  if (opts.breakdown && cohorts.length) return null

  const anyEvent = scan.some(([, m]) => m.event === "*")
  const scanEvents = anyEvent ? null : [...new Set(scan.map(([, m]) => m.event))]
  const seg = opts.breakdown ? `${d.coalesce}(${d.text(opts.breakdown)}, '(not set)')` : null

  const header = [
    `-- ${spec.name}, weekly: ${spec.definition.formula.replace(/\.$/, "")}.`,
    ...measures.map(([k, m]) => `-- ${describeMeasure(k, m)}`),
    `-- One row per complete week (Monday 00:00 UTC)${seg ? ` and ${opts.breakdown}` : ""}, last ${weeks} weeks, oldest first.`,
    dialect === "hogql"
      ? "-- HogQL: paste into a PostHog SQL insight."
      : `-- ${dialectLabel[dialect]}. Reads ${schemaLine(dialect)}. ${QUERY_SCHEMAS[dialect].notes}`,
  ]

  const scanSql = scan.length
    ? [
        "SELECT",
        indent(
          [
            `${d.week(d.ts)} AS week`,
            ...(seg ? [`${seg} AS segment`] : []),
            ...scan.map(([k, m]) => `${aggregate(d, m, scanEvents)} AS ${k}`),
          ].join(",\n")
        ),
        "FROM events",
        whereClause([
          ...d.inWindow(d.ts, weeks),
          ...(scanEvents
            ? [`${d.event} ${scanEvents.length === 1 ? `= ${d.str(scanEvents[0]!)}` : `IN (${scanEvents.map(d.str).join(", ")})`}`]
            : []),
        ]),
        `GROUP BY ${d.week(d.ts)}${seg ? `, ${seg}` : ""}`,
      ].join("\n")
    : null

  const valueOf = (ref: (k: MeasureKey) => string) => {
    const top = spec.subtract ? `(${ref("numerator")} - ${ref("subtract")})` : ref("numerator")
    return spec.denominator ? d.div(top, ref("denominator")) : top
  }
  const keys = measures.map(([k]) => k)

  let body: string
  if (seg) {
    body = compose(d, [["scan", scanSql!]], (from) =>
      [
        `SELECT week, segment, ${keys.join(", ")}, ${valueOf((k) => k)} AS value`,
        `FROM ${from("scan")}${d.ctes ? "" : " AS scan"}`,
        "ORDER BY week, segment",
      ].join("\n")
    )
  } else {
    const rels: [string, string][] = [["weeks", d.spine(weeks)]]
    if (scanSql) rels.push(["scan", scanSql])
    for (const [k, m] of cohorts) rels.push([`cohort_${k}`, cohortSql(d, m, weeks)])
    const joinRef = (name: string) => (d.ctes ? name : `{${name}}`)
    const totals = [
      "SELECT",
      indent(
        ["w.week AS week", ...measures.map(([k, m]) => `${d.coalesce}(${isCohort(m) ? `c_${k}.value` : `s.${k}`}, 0) AS ${k}`)].join(",\n")
      ),
      `FROM ${joinRef("weeks")} AS w`,
      ...(scanSql ? [`LEFT JOIN ${joinRef("scan")} AS s ON s.week = w.week`] : []),
      ...cohorts.map(([k]) => `LEFT JOIN ${joinRef(`cohort_${k}`)} AS c_${k} ON c_${k}.week = w.week`),
    ].join("\n")
    rels.push(["totals", totals])
    body = compose(d, rels, (from) =>
      [
        `SELECT week, ${keys.join(", ")}, ${valueOf((k) => k)} AS value`,
        `FROM ${from("totals")}${d.ctes ? "" : " AS t"}`,
        "ORDER BY week",
      ].join("\n")
    )
  }
  return [...header, body, ...(d.limit ? [d.limit] : [])].join("\n") + d.end
}

export function emitAll(spec: MetricSpec, opts: QueryOptions = {}): Record<Dialect, string | null> {
  return {
    hogql: emitQuery(spec, "hogql", opts),
    postgres: emitQuery(spec, "postgres", opts),
    bigquery: emitQuery(spec, "bigquery", opts),
    snowflake: emitQuery(spec, "snowflake", opts),
  }
}
