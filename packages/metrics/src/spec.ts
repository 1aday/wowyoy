import { z } from "zod"

/**
 * The metric spec: the one place a person writes. One YAML file per metric in
 * packages/metrics/specs, validated here at build. Every public page, file twin,
 * query and MCP answer is compiled from these files and nothing else.
 *
 * This file imports only zod so the spec build script can run it directly in Node.
 */

export const families = [
  "traffic",
  "acquisition",
  "conversion",
  "revenue",
  "customers",
  "activation",
  "subscription",
  "engagement",
] as const
export type Family = (typeof families)[number]

export const familyNames: Record<Family, string> = {
  traffic: "Traffic",
  acquisition: "Acquisition and spend",
  conversion: "Store conversion",
  revenue: "Orders and revenue",
  customers: "Customers and repeat",
  activation: "Signup and activation",
  subscription: "Subscription revenue",
  engagement: "Engagement and retention",
}

export const dialects = ["hogql", "postgres", "bigquery", "snowflake"] as const
export type Dialect = (typeof dialects)[number]

export const dialectNames: Record<Dialect, string> = {
  hogql: "HogQL",
  postgres: "Postgres",
  bigquery: "BigQuery",
  snowflake: "Snowflake",
}

/** The four volumes every Standard page reads the noise band at. */
export const REFERENCE_VOLUMES = [200, 800, 3000, 12000] as const

/**
 * How a weekly number wobbles by chance alone, which decides its sampling floor:
 * - binomial: a rate of `denominator` trials (conversion, churn). σ = √(p(1−p)/n)
 * - poisson: a count of independent events (orders, signups). σ = √N
 * - compound: a sum of amounts over N events (revenue). σ/total = √((1+cv²)/N)
 * - mean: an average amount over N events (AOV, ARPA). σ/mean = cv/√N
 * - process: a stock or a ratio of sums with no single sampling unit (MRR, MER, DAU/MAU).
 *   No sampling floor; only the metric's own week-to-week behaviour (XmR limits) judges it.
 */
export const noiseTypes = ["binomial", "poisson", "compound", "mean", "process"] as const
export type NoiseType = (typeof noiseTypes)[number]

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "kebab-case: lowercase letters, digits and single hyphens")
const eventName = z.string().min(1).max(80)
const propertyName = z.string().regex(/^\$?[A-Za-z_][A-Za-z0-9_.]*$/, "a plain property name")

const filter = z.object({
  property: propertyName,
  op: z.enum(["eq", "neq", "in", "not_in", "is_set", "is_not_set", "gt", "gte", "lt", "lte"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).optional(),
})
export type SpecFilter = z.infer<typeof filter>

/**
 * One weekly measure. The compiler emits it in every dialect from these fields:
 * - count: events. unique_users / unique_sessions: distinct people or sessions with the event.
 * - sum: a numeric property summed over the events (revenue, spend).
 * - first_time_users: people whose first ever such event lands in the week (new customers).
 * - returning_users: people with the event this week who also had it in an earlier week.
 */
export const aggregates = ["count", "unique_users", "unique_sessions", "sum", "first_time_users", "returning_users"] as const
export type Aggregate = (typeof aggregates)[number]

const measure = z
  .object({
    label: z.string().min(1),
    aggregate: z.enum(aggregates),
    /** Canonical event name. "*" means any event (all activity). */
    event: z.union([eventName, z.literal("*")]),
    property: propertyName.optional(),
    where: z.array(filter).default([]),
  })
  .refine((m) => m.aggregate !== "sum" || !!m.property, { message: "sum needs a property", path: ["property"] })
export type Measure = z.infer<typeof measure>

const dialectQueries = z.object({
  hogql: z.string().min(20),
  postgres: z.string().min(20),
  bigquery: z.string().min(20),
  snowflake: z.string().min(20),
})

const directionCheck = z.object({
  /** The one question to answer, in the order an operator would ask it. */
  check: z.string().min(10),
  /** What a "yes" looks like in the data. */
  yes: z.string().min(10),
})

const driver = z.object({
  id: slug,
  label: z.string().min(1),
  /** A metric in the Standard this driver is. The Why page links it and reuses its query. */
  metric: slug.optional(),
  /** Split this metric by a property to see whether one segment moved (device, channel, country). */
  breakdown: propertyName.optional(),
  /** A world feed that can explain it (outside causes), checked in the Why page's world step. */
  feed: z.enum(["stripe", "cloudflare", "google-search", "app-stores", "holidays", "shopping", "ad-platforms"]).optional(),
  dropped: directionCheck,
  spiked: directionCheck,
})
export type Driver = z.infer<typeof driver>

const canonicalEvent = z.object({
  name: eventName,
  description: z.string().min(5),
  /** What the same event is commonly called in PostHog, Segment, GA4 and Shopify. */
  also_called: z.array(z.string()).default([]),
  properties: z.array(z.object({ name: propertyName, description: z.string() })).default([]),
})

export const metricSpecSchema = z
  .object({
    id: slug,
    name: z.string().min(2).max(60),
    /** Other names people search for. Each redirects (301) to this page; never a second page. */
    aliases: z.array(z.string()).default([]),
    family: z.enum(families),
    /** The product catalog metric this spec defines, when the Pulse table has it. */
    catalog_id: z.string().optional(),
    kind: z.enum(["count", "currency", "rate", "ratio", "duration"]),
    /** For durations: the unit values are in. */
    duration_unit: z.enum(["minutes", "hours", "days", "months"]).optional(),
    polarity: z.enum(["up-is-good", "down-is-good"]),
    definition: z.object({
      /** One sentence, the answer to "what is X". */
      one_line: z.string().min(20).max(220),
      /** The formula in words, e.g. "Paid orders ÷ checkouts started". */
      formula: z.string().min(3),
    }),
    events: z.array(canonicalEvent).min(1),
    numerator: measure,
    /** Taken away from the numerator, in the same week: refunds from gross sales. */
    subtract: measure.optional(),
    denominator: measure.optional(),
    /**
     * Hand-written queries for metrics the measures can't express (cohorts, MRR snapshots).
     * All four dialects or none. When present they replace the compiled queries.
     */
    queries: dialectQueries.optional(),
    noise: z.object({
      type: z.enum(noiseTypes),
      /** Below this weekly volume the verdict is "too few to say", never a number. */
      min_denominator: z.number().int().positive(),
      /** What one unit of volume is, for the band table: "checkouts a week". */
      volume_unit: z.string().min(3),
      /** A typical value, used to read the band at the reference volumes (rates as fractions). */
      typical: z.number(),
      /** Coefficient of variation of one unit (an order's value), for compound and mean. */
      cv: z.number().positive().optional(),
      reference_volumes: z.array(z.number().int().positive()).length(4).default([...REFERENCE_VOLUMES]),
    }),
    /** How the example chart's fictional data behaves. Never a real customer. */
    example: z.object({
      business: z.enum(["store", "saas", "app"]),
      /** Value of the latest week, in the metric's own unit (rates as fractions). */
      level: z.number(),
      /** Weekly volume behind it (denominator for rates, events for counts). */
      volume: z.number().positive(),
      /** Drift per year, as a fraction: 0.2 = 20% a year. */
      trend: z.number().default(0),
      /**
       * How the business's peak weeks move this value, as an exponent on the season's lift:
       * 1 moves with them (store conversion in Black Friday week), 0 ignores them, −1 moves against them.
       * Volumes always follow the season.
       */
      season: z.number().min(-1).max(1).default(0),
    }),
    drivers: z.array(driver).default([]),
    /** Driver ids in the order a good operator checks them. Every driver appears once. */
    diagnose_order: z.array(slug).default([]),
    related: z.array(slug).default([]),
    prose: z.object({
      why_it_matters: z.string().min(80),
      pitfalls: z.array(z.string().min(20)).min(2).max(6),
    }),
    /** Who signed off the spec. Unreviewed specs never publish on production. */
    reviewed_by: z.string().nullable().default(null),
    reviewed_at: z.string().nullable().default(null),
    version: z.number().int().positive().default(1),
  })
  .superRefine((s, ctx) => {
    if ((s.kind === "rate" || s.kind === "ratio") && !s.denominator && !s.queries) {
      ctx.addIssue({ code: "custom", message: `${s.kind} needs a denominator or hand-written queries`, path: ["denominator"] })
    }
    if (s.kind === "duration" && !s.duration_unit) {
      ctx.addIssue({ code: "custom", message: "a duration needs duration_unit", path: ["duration_unit"] })
    }
    if (s.noise.type === "binomial" && (s.noise.typical <= 0 || s.noise.typical >= 1)) {
      ctx.addIssue({ code: "custom", message: "a binomial typical value is a fraction between 0 and 1", path: ["noise", "typical"] })
    }
    if ((s.noise.type === "compound" || s.noise.type === "mean") && s.noise.cv == null) {
      ctx.addIssue({ code: "custom", message: `${s.noise.type} noise needs cv`, path: ["noise", "cv"] })
    }
    const ids = s.drivers.map((d) => d.id)
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "driver ids repeat", path: ["drivers"] })
    const order = s.diagnose_order
    const sameSet = order.length === ids.length && order.every((o) => ids.includes(o))
    if (ids.length && !sameSet) {
      ctx.addIssue({ code: "custom", message: "diagnose_order must list every driver id exactly once", path: ["diagnose_order"] })
    }
    if (s.related.includes(s.id)) ctx.addIssue({ code: "custom", message: "a spec can't relate to itself", path: ["related"] })
  })

export type MetricSpec = z.infer<typeof metricSpecSchema>
export type MetricSpecInput = z.input<typeof metricSpecSchema>

/** Turn an alias into the slug it redirects from: "Cart conversion" → "cart-conversion". */
export function aliasSlug(alias: string) {
  return alias
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Checks that only make sense across the whole set: links resolve, aliases don't collide.
 * Returns human-readable problems; an empty list means the set compiles.
 */
export function crossCheck(specs: readonly MetricSpec[]): string[] {
  const problems: string[] = []
  const ids = new Set(specs.map((s) => s.id))
  const slugs = new Map<string, string>()
  for (const s of specs) slugs.set(s.id, s.id)
  for (const s of specs) {
    for (const r of s.related) if (!ids.has(r)) problems.push(`${s.id}: related "${r}" is not a spec`)
    for (const d of s.drivers) if (d.metric && !ids.has(d.metric)) problems.push(`${s.id}: driver ${d.id} links "${d.metric}", not a spec`)
    for (const a of s.aliases) {
      const as = aliasSlug(a)
      if (!as || as === s.id) continue
      const owner = slugs.get(as)
      if (owner && owner !== s.id) problems.push(`${s.id}: alias "${a}" collides with ${owner}`)
      else slugs.set(as, s.id)
    }
  }
  return problems
}
