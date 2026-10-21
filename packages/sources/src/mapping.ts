import { z } from "zod"
import type { BaseMeasure } from "@workspace/metrics"

/**
 * A mapping says, once, which of a customer's events each base measure reads.
 * Claude (or the rules, or the founder) proposes it; after review it compiles to a fixed query.
 * Nothing is re-interpreted on Mondays.
 */

export const filterSchema = z.object({
  property: z.string().min(1).max(200),
  op: z.enum(["contains", "equals"]),
  value: z.string().min(1).max(200),
})
export type EventFilter = z.infer<typeof filterSchema>

export const measureSpecSchema = z.object({
  event: z.string().min(1).max(200),
  filter: filterSchema.optional(),
  /** Numeric property summed for money measures (revenue, spend). */
  property: z.string().min(1).max(200).optional(),
  confidence: z.number().min(0).max(1),
  source: z.enum(["claude", "rules", "you"]),
  reason: z.string().max(400).optional(),
})
export type MeasureSpec = z.infer<typeof measureSpecSchema>

/** Measures read straight from events. New customers is derived from the orders event. */
export const mappedMeasures = ["sessions", "product_views", "carts", "checkouts", "orders", "revenue", "spend"] as const
export type MappedMeasure = (typeof mappedMeasures)[number]

export const mappingSchema = z.object({
  sessions: measureSpecSchema.optional(),
  product_views: measureSpecSchema.optional(),
  carts: measureSpecSchema.optional(),
  checkouts: measureSpecSchema.optional(),
  orders: measureSpecSchema.optional(),
  revenue: measureSpecSchema.optional(),
  spend: measureSpecSchema.optional(),
  /** Count a customer as new in the week of their first ever order event. */
  newCustomers: z.boolean().default(true),
})
export type Mapping = z.infer<typeof mappingSchema>

export type Aggregate = "sessions" | "count" | "sum"

export const measureInfo: Record<
  MappedMeasure,
  { name: string; aggregate: Aggregate; reads: string; required?: boolean; needsProperty?: boolean }
> = {
  sessions: { name: "Sessions", aggregate: "sessions", reads: "Distinct sessions with this event. Usually $pageview.", required: true },
  product_views: { name: "Viewed product", aggregate: "sessions", reads: "Sessions that viewed a product page." },
  carts: { name: "Added to cart", aggregate: "sessions", reads: "Sessions that added an item to the cart." },
  checkouts: { name: "Started checkout", aggregate: "sessions", reads: "Sessions that reached the first checkout step." },
  orders: { name: "Orders", aggregate: "count", reads: "One event per paid order." },
  revenue: { name: "Revenue", aggregate: "sum", reads: "Sum of the order value property.", needsProperty: true },
  spend: { name: "Ad spend", aggregate: "sum", reads: "Sum of a spend property, if you send ad spend as events.", needsProperty: true },
}

export const newCustomersInfo = {
  name: "New customers",
  reads: "People whose first ever order event falls in the week. Repeat share is orders minus new customers.",
}

export type { BaseMeasure }
