import { metricSpecSchema, type Measure, type MetricSpec, type MetricSpecInput, type SpecFilter } from "@workspace/metrics"

type MeasureInput = NonNullable<MetricSpecInput["numerator"]>

/** A valid spec with only the fields a test cares about set. */
export function makeSpec(over: Partial<MetricSpecInput> & { numerator: MeasureInput }): MetricSpec {
  return metricSpecSchema.parse({
    id: "test-metric",
    name: "Test metric",
    family: "conversion",
    kind: over.denominator ? "rate" : "count",
    polarity: "up-is-good",
    definition: { one_line: "A metric that exists only in the compiler's tests.", formula: "Things ÷ other things" },
    events: [{ name: "order_completed", description: "A paid order." }],
    noise: { type: "poisson", min_denominator: 10, volume_unit: "things a week", typical: 100 },
    example: { business: "store", level: 100, volume: 100 },
    prose: {
      why_it_matters: "This metric exists only so the query compiler can be tested against every aggregate and filter it supports.",
      pitfalls: ["Never published: it lives in the test folder.", "Its numbers are synthetic and mean nothing."],
    },
    ...over,
  })
}

export const m = (aggregate: Measure["aggregate"], event: string, extra: Partial<MeasureInput> = {}): MeasureInput => ({
  label: `${aggregate} of ${event}`,
  aggregate,
  event,
  ...extra,
})

/** Every compiled shape worth running: each aggregate, each filter op, subtract, denominator, any-event, cohorts. */
export const cases: Record<string, MetricSpec> = {
  count: makeSpec({ numerator: m("count", "$pageview") }),
  countMobile: makeSpec({ numerator: m("count", "$pageview", { where: [{ property: "$device_type", op: "eq", value: "Mobile" }] }) }),
  anyEventUsers: makeSpec({ numerator: m("unique_users", "*") }),
  anyEventCount: makeSpec({ numerator: m("count", "*") }),
  sessions: makeSpec({ numerator: m("unique_sessions", "$pageview") }),
  rate: makeSpec({ numerator: m("unique_sessions", "order_completed"), denominator: m("unique_sessions", "checkout_started") }),
  netRevenue: makeSpec({
    kind: "currency",
    numerator: m("sum", "order_completed", { property: "total" }),
    subtract: m("sum", "order_refunded", { property: "amount" }),
  }),
  netPerOrder: makeSpec({
    kind: "currency",
    numerator: m("sum", "order_completed", { property: "total" }),
    subtract: m("sum", "order_refunded", { property: "amount" }),
    denominator: m("count", "order_completed"),
  }),
  firstTime: makeSpec({ numerator: m("first_time_users", "order_completed") }),
  returningShare: makeSpec({ numerator: m("returning_users", "order_completed"), denominator: m("unique_users", "order_completed") }),
  newUsersAnyEvent: makeSpec({ numerator: m("first_time_users", "*") }),
  cohortOnlyRatio: makeSpec({
    kind: "ratio",
    numerator: m("returning_users", "order_completed"),
    denominator: m("first_time_users", "order_completed"),
  }),
  neq: makeSpec({ numerator: m("count", "$pageview", { where: [{ property: "$device_type", op: "neq", value: "Mobile" }] }) }),
  inList: makeSpec({ numerator: m("count", "$pageview", { where: [{ property: "utm_source", op: "in", value: ["google", "bing"] }] }) }),
  notIn: makeSpec({ numerator: m("count", "$pageview", { where: [{ property: "utm_source", op: "not_in", value: ["google"] }] }) }),
  emptyIn: makeSpec({ numerator: m("count", "$pageview", { where: [{ property: "utm_source", op: "in", value: [] }] }) }),
  isSet: makeSpec({ numerator: m("count", "$pageview", { where: [{ property: "utm_source", op: "is_set" }] }) }),
  isNotSet: makeSpec({ numerator: m("count", "$pageview", { where: [{ property: "utm_source", op: "is_not_set" }] }) }),
  gt: makeSpec({ numerator: m("count", "order_completed", { where: [{ property: "total", op: "gt", value: 50 }] }) }),
  gte: makeSpec({ numerator: m("count", "order_completed", { where: [{ property: "total", op: "gte", value: 50 }] }) }),
  lt: makeSpec({ numerator: m("count", "order_completed", { where: [{ property: "total", op: "lt", value: 50 }] }) }),
  lte: makeSpec({ numerator: m("count", "order_completed", { where: [{ property: "total", op: "lte", value: 50 }] }) }),
  boolEq: makeSpec({ numerator: m("count", "coupon_applied", { where: [{ property: "valid", op: "eq", value: true }] }) }),
  nested: makeSpec({ numerator: m("count", "$pageview", { where: [{ property: "ctx.page", op: "eq", value: "/cart" }] }) }),
  quoted: makeSpec({ numerator: m("count", "$pageview", { where: [{ property: "utm_campaign", op: "eq", value: "it's \\ on" }] }) }),
  mixed: makeSpec({
    numerator: m("unique_users", "order_completed", { where: [{ property: "is_first_order", op: "eq", value: true }] }),
    denominator: m("unique_users", "*"),
  }),
}

export interface Ev {
  event: string
  ts: Date
  user: string | null
  session: string
  props: Record<string, unknown>
}

const DAY = 864e5
export const WEEKS = 8

/** Monday 00:00 UTC of the week `now` falls in. */
export function thisMonday(now = new Date()) {
  const d = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return d - ((new Date(d).getUTCDay() + 6) % 7) * DAY
}

export const weekKey = (t: number) => new Date(thisMonday(new Date(t))).toISOString().slice(0, 10)

/** Seeded events around the window: inside, on its edges, this week (excluded) and long before it. */
export function dataset(now = new Date()): Ev[] {
  let seed = 7
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!
  const mon = thisMonday(now)
  const evs: Ev[] = []
  const users = Array.from({ length: 40 }, (_, i) => `u${i}`)
  const add = (event: string, ts: number, user: string | null, session: string, props: Record<string, unknown> = {}) =>
    evs.push({ event, ts: new Date(ts), user, session, props })
  // History far before the window: some users ordered long ago, so they return rather than arrive.
  for (let i = 0; i < 12; i++) add("order_completed", mon - 30 * 7 * DAY + i * 3600e3, users[i]!, `old${i}`, { total: 40 })
  for (let w = 1; w <= WEEKS + 1; w++) {
    const start = mon - w * 7 * DAY
    const n = 30 + Math.floor(rand() * 30)
    for (let i = 0; i < n; i++) {
      const ts = start + Math.floor(rand() * 7 * DAY)
      const user = rand() < 0.1 ? null : pick(users)
      const session = rand() < 0.05 ? "" : `s${w}-${Math.floor(rand() * 25)}`
      const device = pick(["Mobile", "Desktop", "Tablet", null])
      const source = pick(["google", "bing", "newsletter", "", null])
      add("$pageview", ts, user, session, {
        ...(device ? { $device_type: device } : {}),
        ...(source != null ? { utm_source: source } : {}),
        ctx: { page: pick(["/cart", "/home"]) },
        utm_campaign: rand() < 0.2 ? "it's \\ on" : "spring",
      })
      if (rand() < 0.35) add("checkout_started", ts + 1000, user, session, device ? { $device_type: device } : {})
      if (rand() < 0.2) {
        const total = pick([20, 50, 75.5, 120, "88", "", "n/a"])
        add("order_completed", ts + 2000, user, session, {
          total,
          is_first_order: rand() < 0.3,
          ...(device ? { $device_type: device } : {}),
        })
      }
      if (rand() < 0.04) add("order_refunded", ts + 3000, user, "", { amount: pick([10, 25.25, "5"]) })
      if (rand() < 0.1) add("coupon_applied", ts + 500, user, session, { valid: rand() < 0.5 })
    }
  }
  // Edges: first instant of the window counts, the first instant of this week doesn't, nor anything after.
  add("$pageview", mon - WEEKS * 7 * DAY, "edge-in", "edge-1", {})
  add("$pageview", mon - WEEKS * 7 * DAY - 1000, "edge-out", "edge-0", {})
  add("$pageview", mon - 1000, "edge-last", "edge-2", {})
  add("$pageview", mon, "edge-now", "edge-3", {})
  add("order_completed", mon + 1000, "u1", "late", { total: 999 })
  return evs
}

/** A property as text, the way every dialect reads JSON: strings as is, numbers and booleans spelled out. */
function text(e: Ev, name: string): string | null {
  let v: unknown = e.props
  for (const k of name.split(".")) v = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined
  if (v == null) return null
  return typeof v === "string" ? v : String(v)
}

function num(e: Ev, name: string): number | null {
  const t = text(e, name)
  if (t == null || t.trim() === "") return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function passes(e: Ev, f: SpecFilter): boolean {
  const p = text(e, f.property)
  const vals = (Array.isArray(f.value) ? f.value : [f.value]).map(String)
  switch (f.op) {
    case "eq":
      return p === String(f.value)
    case "neq":
      return p == null || p !== String(f.value)
    case "in":
      return p != null && vals.includes(p)
    case "not_in":
      return p == null || !vals.includes(p)
    case "is_set":
      return (p ?? "") !== ""
    case "is_not_set":
      return (p ?? "") === ""
    default: {
      const n = num(e, f.property)
      if (n == null) return false
      const v = Number(f.value)
      return f.op === "gt" ? n > v : f.op === "gte" ? n >= v : f.op === "lt" ? n < v : n <= v
    }
  }
}

const matches = (e: Ev, me: Measure) => (me.event === "*" || e.event === me.event) && me.where.every((f) => passes(e, f))

/** The weekly measures, computed directly from the events: what every dialect must return. */
export function expected(spec: MetricSpec, evs: Ev[], now = new Date()) {
  const mon = thisMonday(now)
  const weeks = Array.from({ length: WEEKS }, (_, i) => new Date(mon - (WEEKS - i) * 7 * DAY).toISOString().slice(0, 10))
  const measure = (me: Measure | undefined) => {
    if (!me) return null
    const out = new Map(weeks.map((w) => [w, 0]))
    const hits = evs.filter((e) => matches(e, me))
    const inWin = (t: number) => t >= mon - WEEKS * 7 * DAY && t < mon
    const firsts = new Map<string, number>()
    for (const e of hits) if (e.user != null) firsts.set(e.user, Math.min(firsts.get(e.user) ?? Infinity, e.ts.getTime()))
    if (me.aggregate === "first_time_users") {
      for (const t of firsts.values()) if (inWin(t)) out.set(weekKey(t), out.get(weekKey(t))! + 1)
      return out
    }
    const byWeek = new Map<string, Ev[]>()
    for (const e of hits)
      if (inWin(e.ts.getTime())) byWeek.set(weekKey(e.ts.getTime()), [...(byWeek.get(weekKey(e.ts.getTime())) ?? []), e])
    for (const [w, es] of byWeek) {
      let v = 0
      if (me.aggregate === "count") v = es.length
      if (me.aggregate === "unique_users") v = new Set(es.flatMap((e) => (e.user != null ? [e.user] : []))).size
      if (me.aggregate === "unique_sessions") v = new Set(es.flatMap((e) => (e.session ? [e.session] : []))).size
      if (me.aggregate === "sum") v = es.reduce((a, e) => a + (num(e, me.property!) ?? 0), 0)
      if (me.aggregate === "returning_users")
        v = new Set(es.flatMap((e) => (e.user != null && weekKey(firsts.get(e.user)!) < w ? [e.user] : []))).size
      out.set(w, v)
    }
    return out
  }
  const n = measure(spec.numerator)!
  const s = measure(spec.subtract)
  const d = measure(spec.denominator)
  return weeks.map((week) => {
    const top = n.get(week)! - (s?.get(week) ?? 0)
    const den = d?.get(week)
    return {
      week,
      numerator: n.get(week)!,
      ...(s ? { subtract: s.get(week)! } : {}),
      ...(d ? { denominator: den! } : {}),
      value: d ? (den === 0 ? null : top / den!) : top,
    }
  })
}

/** Expected breakdown rows for a scan-only spec: (week, segment) with any event, as dialects return them. */
export function expectedBreakdown(spec: MetricSpec, evs: Ev[], property: string, now = new Date()) {
  const segs = new Set(evs.map((e) => text(e, property) ?? "(not set)"))
  const rows: { week: string; segment: string; value: number | null; numerator: number }[] = []
  for (const seg of segs) {
    const sub = evs.filter((e) => (text(e, property) ?? "(not set)") === seg)
    const scanned = sub.filter((e) =>
      [spec.numerator, spec.subtract, spec.denominator].some((me) => me && (me.event === "*" || me.event === e.event))
    )
    const seen = new Set(
      scanned
        .filter((e) => e.ts.getTime() >= thisMonday(now) - WEEKS * 7 * DAY && e.ts.getTime() < thisMonday(now))
        .map((e) => weekKey(e.ts.getTime()))
    )
    for (const r of expected(spec, sub, now))
      if (seen.has(r.week)) rows.push({ week: r.week, segment: seg, value: r.value, numerator: r.numerator })
  }
  return rows.sort((a, b) => (a.week === b.week ? (a.segment < b.segment ? -1 : 1) : a.week < b.week ? -1 : 1))
}
