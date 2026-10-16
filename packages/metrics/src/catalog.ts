/**
 * The canonical metric catalog. Every dashboard, search page and source adapter
 * speaks in these ids. Order is funnel position: the Weekly Growth Pulse reads top to bottom.
 */

export type MetricKind = "count" | "currency" | "rate" | "ratio"

/** Which direction is good. Color still means direction only; this decides wording. */
export type Polarity = "up-is-good" | "down-is-good"

export interface MetricDef {
  id: string
  name: string
  short: string
  kind: MetricKind
  polarity: Polarity
  stage: "traffic" | "conversion" | "revenue" | "customers" | "efficiency"
  definition: string
  /** For rates and ratios: the two metrics it is built from. */
  formula?: { numerator: string; denominator: string }
}

export const catalog = [
  {
    id: "sessions",
    name: "Sessions",
    short: "Sessions",
    kind: "count",
    polarity: "up-is-good",
    stage: "traffic",
    definition: "Visits to the store. A new session starts after 30 minutes without activity.",
  },
  {
    id: "product_view_rate",
    name: "Product view rate",
    short: "Viewed product",
    kind: "rate",
    polarity: "up-is-good",
    stage: "conversion",
    definition: "Share of sessions that viewed at least one product page.",
    formula: { numerator: "product_views", denominator: "sessions" },
  },
  {
    id: "add_to_cart_rate",
    name: "Add-to-cart rate",
    short: "Added to cart",
    kind: "rate",
    polarity: "up-is-good",
    stage: "conversion",
    definition: "Share of product-viewing sessions that added an item to the cart.",
    formula: { numerator: "carts", denominator: "product_views" },
  },
  {
    id: "checkout_start_rate",
    name: "Checkout start rate",
    short: "Started checkout",
    kind: "rate",
    polarity: "up-is-good",
    stage: "conversion",
    definition: "Share of carts that reached the first checkout step.",
    formula: { numerator: "checkouts", denominator: "carts" },
  },
  {
    id: "checkout_completion_rate",
    name: "Checkout completion rate",
    short: "Completed checkout",
    kind: "rate",
    polarity: "up-is-good",
    stage: "conversion",
    definition: "Share of started checkouts that became a paid order.",
    formula: { numerator: "orders", denominator: "checkouts" },
  },
  {
    id: "orders",
    name: "Orders",
    short: "Orders",
    kind: "count",
    polarity: "up-is-good",
    stage: "revenue",
    definition: "Paid orders, excluding test and fully refunded orders.",
  },
  {
    id: "conversion_rate",
    name: "Conversion rate",
    short: "Conversion",
    kind: "rate",
    polarity: "up-is-good",
    stage: "revenue",
    definition: "Orders divided by sessions.",
    formula: { numerator: "orders", denominator: "sessions" },
  },
  {
    id: "aov",
    name: "Average order value",
    short: "AOV",
    kind: "currency",
    polarity: "up-is-good",
    stage: "revenue",
    definition: "Net revenue divided by orders.",
    formula: { numerator: "revenue", denominator: "orders" },
  },
  {
    id: "revenue",
    name: "Net revenue",
    short: "Revenue",
    kind: "currency",
    polarity: "up-is-good",
    stage: "revenue",
    definition: "Order revenue after discounts and refunds, before tax and shipping.",
  },
  {
    id: "new_customers",
    name: "New customers",
    short: "New customers",
    kind: "count",
    polarity: "up-is-good",
    stage: "customers",
    definition: "Customers placing their first ever order this week.",
  },
  {
    id: "repeat_share",
    name: "Repeat order share",
    short: "Repeat share",
    kind: "rate",
    polarity: "up-is-good",
    stage: "customers",
    definition: "Share of orders placed by customers who had ordered before.",
    formula: { numerator: "repeat_orders", denominator: "orders" },
  },
  {
    id: "spend",
    name: "Marketing spend",
    short: "Spend",
    kind: "currency",
    polarity: "down-is-good",
    stage: "efficiency",
    definition: "Paid media spend across all ad platforms.",
  },
  {
    id: "mer",
    name: "Marketing efficiency ratio",
    short: "MER",
    kind: "ratio",
    polarity: "up-is-good",
    stage: "efficiency",
    definition: "Net revenue divided by marketing spend.",
    formula: { numerator: "revenue", denominator: "spend" },
  },
  {
    id: "ncac",
    name: "New customer acquisition cost",
    short: "nCAC",
    kind: "currency",
    polarity: "down-is-good",
    stage: "efficiency",
    definition: "Marketing spend divided by new customers.",
    formula: { numerator: "spend", denominator: "new_customers" },
  },
] as const satisfies readonly MetricDef[]

export type MetricId = (typeof catalog)[number]["id"]

export const metricById = Object.fromEntries(catalog.map((m) => [m.id, m])) as Record<
  MetricId,
  MetricDef
>
