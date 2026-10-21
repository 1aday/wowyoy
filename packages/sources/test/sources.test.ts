import { afterEach, describe, expect, it, vi } from "vitest"
import { condition, ident, normalizeHost, ruleMapping, str, weeklyQuery, weeklySeries, type DiscoveredEvent, type Mapping } from "../src"

describe("HogQL compiler", () => {
  it("escapes names so they can only be values", () => {
    expect(str("it's")).toBe("'it\\'s'")
    expect(str("a\\'; DROP")).toBe("'a\\\\\\'; DROP'")
    expect(ident("$current_url")).toBe("$current_url")
    expect(ident("order total")).toBe("`order total`")
    expect(ident("a`b")).toBe("`a\\`b`")
    expect(condition({ event: "x", filter: { property: "$current_url", op: "contains", value: "50%_off" } })).toBe(
      "(event = 'x' AND toString(properties.$current_url) ILIKE '%50\\\\%\\\\_off%')",
    )
  })

  it("compiles one weekly query with a fixed aggregate per measure", () => {
    const mapping: Mapping = {
      newCustomers: true,
      sessions: { event: "$pageview", confidence: 1, source: "rules" },
      orders: { event: "order_completed", confidence: 1, source: "rules" },
      revenue: { event: "order_completed", property: "total", confidence: 1, source: "rules" },
    }
    const q = weeklyQuery(mapping, { from: "2025-01-06", to: "2025-03-03" })!
    expect(q).toContain("uniqIf($session_id, event = '$pageview') AS sessions")
    expect(q).toContain("countIf(event = 'order_completed') AS orders")
    expect(q).toContain("sumIf(toFloat(properties.total), event = 'order_completed') AS revenue")
    expect(q).toContain("event IN ('$pageview', 'order_completed')")
  })
})

describe("hosts", () => {
  it("accepts PostHog cloud and refuses private addresses", () => {
    expect(normalizeHost("us.posthog.com")).toBe("https://us.posthog.com")
    expect(normalizeHost("https://app.posthog.com/project/1")).toBe("https://us.posthog.com")
    expect(() => normalizeHost("http://10.0.0.4")).toThrow()
    expect(() => normalizeHost("https://localhost:8000")).toThrow()
    expect(normalizeHost("http://localhost:3199", true)).toBe("http://localhost:3199")
  })
})

describe("rule mapper", () => {
  it("maps Segment-style ecommerce events and finds the revenue property", () => {
    const events: DiscoveredEvent[] = [
      { event: "$pageview", events: 900, sessions: 400 },
      { event: "Product Viewed", events: 300, sessions: 200 },
      { event: "Product Added", events: 80, sessions: 60 },
      { event: "Checkout Started", events: 40, sessions: 35 },
      { event: "Order Completed", events: 20, sessions: 20, properties: [{ key: "revenue", numeric: true }, { key: "currency", numeric: false }] },
    ]
    const m = ruleMapping(events)
    expect(m.sessions?.event).toBe("$pageview")
    expect(m.product_views?.event).toBe("Product Viewed")
    expect(m.carts?.event).toBe("Product Added")
    expect(m.checkouts?.event).toBe("Checkout Started")
    expect(m.orders?.event).toBe("Order Completed")
    expect(m.revenue?.property).toBe("revenue")
    expect(m.spend).toBeUndefined()
  })
})

describe("weeklySeries", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("reads weekly measures and derives rates with fixed formulas", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const q = JSON.parse(String(init.body)).query.query as string
      const results = q.includes("first_order")
        ? [["2025-01-13", 30]]
        : [
            ["2025-01-06", 1000, 50, 2000],
            ["2025-01-13", 1100, 60, 2500],
          ]
      return new Response(JSON.stringify({ results }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)
    const mapping: Mapping = {
      newCustomers: true,
      sessions: { event: "$pageview", confidence: 1, source: "rules" },
      orders: { event: "order_completed", confidence: 1, source: "rules" },
      revenue: { event: "order_completed", property: "total", confidence: 1, source: "rules" },
    }
    const rows = await weeklySeries({ host: "https://us.posthog.com", projectId: "1", apiKey: "phx_x" }, mapping, { from: "2025-01-06", to: "2025-01-27" })
    expect(rows.map((r) => r.week)).toEqual(["2025-01-06", "2025-01-13", "2025-01-20"])
    expect(rows[1]!.values.conversion_rate).toBeCloseTo(60 / 1100)
    expect(rows[1]!.values.aov).toBeCloseTo(2500 / 60)
    expect(rows[1]!.values.repeat_share).toBeCloseTo(30 / 60)
    expect(rows[2]!.values.orders).toBe(0)
  })
})
