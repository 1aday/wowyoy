import http from "node:http"
import { fmtDate, generateStore, isoMonday } from "@workspace/metrics"

/**
 * A stand-in for PostHog's API, enough for the connect flow: the project endpoint and the
 * HogQL queries wowyoy sends (discovery, property samples, the weekly read, new customers).
 * Data comes from the seeded sample store, so the e2e run reads two years of realistic weeks.
 */

export const MOCK_PORT = 3199
export const MOCK_KEY = "phx_e2e_test_key"

const end = fmtDate(new Date(isoMonday(new Date()).getTime() - 7 * 864e5))
const store = generateStore({ endWeek: end, seed: 777 })

const events = [
  ["$pageview", 4_800_000, 2_600_000],
  ["$autocapture", 3_200_000, 1_900_000],
  ["Product Viewed", 2_390_000, 1_610_000],
  ["Product Added", 214_000, 171_000],
  ["Checkout Started", 96_000, 88_900],
  ["Order Completed", 57_100, 56_800],
  ["newsletter_signup", 4_100, 4_000],
]

const props: Record<string, Record<string, unknown>> = {
  $pageview: { $current_url: "https://shop.example.com/products/linen-shirt", $pathname: "/products/linen-shirt" },
  "Product Viewed": { product_id: "sku_123", price: 68, category: "Shirts" },
  "Product Added": { product_id: "sku_123", price: 68, quantity: 1 },
  "Checkout Started": { cart_value: 136, items: 2 },
  "Order Completed": { order_id: "1042", revenue: 128.4, currency: "USD", discount: 7.6 },
}

function weekly(query: string) {
  const cols = [...query.matchAll(/\) AS (\w+)/g)].map((m) => m[1]!).filter((c) => c !== "week")
  const [from, to] = [...query.matchAll(/toDateTime\('(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]!)
  return store
    .filter((r) => r.week >= from! && r.week < to!)
    .map((r) => [
      r.week,
      ...cols.map((c) => {
        switch (c) {
          case "sessions":
            return r.values.sessions
          case "product_views":
            return r.counts.product_views
          case "carts":
            return r.counts.carts
          case "checkouts":
            return r.counts.checkouts
          case "orders":
            return r.values.orders
          case "revenue":
            return r.values.revenue
          default:
            return 0
        }
      }),
    ])
}

function newCustomers(query: string) {
  const [from, to] = [...query.matchAll(/toDateTime\('(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]!)
  return store.filter((r) => r.week >= from! && r.week < to!).map((r) => [r.week, r.values.new_customers])
}

export function startMockPostHog() {
  const server = http.createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" })
      res.end(JSON.stringify(body))
    }
    if (req.headers.authorization !== `Bearer ${MOCK_KEY}`) return send(401, { detail: "Invalid personal API key." })
    const url = req.url ?? ""
    if (req.method === "GET" && /^\/api\/projects\/(@current|41208)\/$/.test(url)) return send(200, { id: 41208, name: "Linen & Co", timezone: "UTC" })
    if (req.method === "POST" && /^\/api\/projects\/41208\/query\/$/.test(url)) {
      let body = ""
      req.on("data", (c) => (body += c))
      req.on("end", () => {
        const q = (JSON.parse(body) as { query: { query: string } }).query.query
        if (q.includes("GROUP BY event")) return send(200, { results: events })
        if (q.startsWith("SELECT properties")) {
          const ev = q.match(/event = '([^']+)'/)?.[1] ?? ""
          return send(200, { results: props[ev] ? [[JSON.stringify(props[ev])], [JSON.stringify(props[ev])]] : [] })
        }
        if (q.includes("first_order")) return send(200, { results: newCustomers(q) })
        return send(200, { results: weekly(q) })
      })
      return
    }
    send(404, { detail: "Not found." })
  })
  return new Promise<http.Server>((resolve) => server.listen(MOCK_PORT, () => resolve(server)))
}
