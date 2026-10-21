import { mappedMeasures, measureInfo, type EventFilter, type Mapping, type MappedMeasure, type MeasureSpec } from "./mapping"

/**
 * Compiles a reviewed mapping to fixed HogQL. Every name that came from a customer's
 * project is escaped, so an event or property name can only ever be a value, never SQL.
 */

export function str(value: string) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
}

export function ident(name: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `\`${name.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``
}

export function prop(name: string) {
  return `properties.${ident(name)}`
}

function likeContains(value: string) {
  return str(`%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
}

function filterExpr(f: EventFilter) {
  return f.op === "equals" ? `toString(${prop(f.property)}) = ${str(f.value)}` : `toString(${prop(f.property)}) ILIKE ${likeContains(f.value)}`
}

/** The condition that picks this measure's events. */
export function condition(spec: Pick<MeasureSpec, "event" | "filter">) {
  const ev = `event = ${str(spec.event)}`
  return spec.filter ? `(${ev} AND ${filterExpr(spec.filter)})` : ev
}

/** The aggregate for one measure, as it appears in the weekly query. */
export function measureExpr(measure: MappedMeasure, spec: MeasureSpec) {
  const cond = condition(spec)
  switch (measureInfo[measure].aggregate) {
    case "sessions":
      return `uniqIf($session_id, ${cond})`
    case "count":
      return `countIf(${cond})`
    case "sum":
      return `sumIf(toFloat(${prop(spec.property ?? "revenue")}), ${cond})`
  }
}

export interface WeekWindow {
  /** First Monday included, YYYY-MM-DD */
  from: string
  /** Monday after the last included week, YYYY-MM-DD */
  to: string
}

const dt = (d: string) => `toDateTime(${str(`${d} 00:00:00`)})`

export function weeklyQuery(mapping: Mapping, w: WeekWindow) {
  const parts: string[] = []
  const events = new Set<string>()
  for (const m of mappedMeasures) {
    const spec = mapping[m]
    if (!spec) continue
    parts.push(`  ${measureExpr(m, spec)} AS ${m}`)
    events.add(spec.event)
  }
  if (!parts.length) return null
  return [
    "SELECT",
    "  toString(toMonday(timestamp)) AS week,",
    parts.join(",\n"),
    "FROM events",
    `WHERE timestamp >= ${dt(w.from)} AND timestamp < ${dt(w.to)}`,
    `  AND event IN (${[...events].map(str).join(", ")})`,
    "GROUP BY week",
    "ORDER BY week",
    "LIMIT 1000",
  ].join("\n")
}

/** New customers: people whose first ever order event lands in the week. */
export function newCustomersQuery(orders: MeasureSpec, w: WeekWindow) {
  return [
    "SELECT toString(toMonday(first_order)) AS week, count() AS new_customers",
    "FROM (",
    "  SELECT person_id, min(timestamp) AS first_order",
    "  FROM events",
    `  WHERE ${condition(orders)}`,
    "  GROUP BY person_id",
    ")",
    `WHERE first_order >= ${dt(w.from)} AND first_order < ${dt(w.to)}`,
    "GROUP BY week",
    "ORDER BY week",
    "LIMIT 1000",
  ].join("\n")
}

/** The last `weeks` complete weeks before `today` (UTC Mondays). */
export function completeWeeks(weeks: number, today = new Date()): WeekWindow {
  const day = (today.getUTCDay() + 6) % 7
  const thisMonday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - day)
  const from = new Date(thisMonday - weeks * 7 * 864e5)
  return { from: from.toISOString().slice(0, 10), to: new Date(thisMonday).toISOString().slice(0, 10) }
}

/** Last 30 days of event volume: the menu Claude and the founder choose from. */
export const discoveryQuery = [
  "SELECT event, count() AS events, uniq($session_id) AS sessions",
  "FROM events",
  "WHERE timestamp > now() - INTERVAL 30 DAY",
  "GROUP BY event",
  "ORDER BY events DESC",
  "LIMIT 150",
].join("\n")

export function sampleQuery(event: string, rows = 5) {
  return [`SELECT properties FROM events`, `WHERE event = ${str(event)} AND timestamp > now() - INTERVAL 30 DAY`, "ORDER BY timestamp DESC", `LIMIT ${rows}`].join("\n")
}
