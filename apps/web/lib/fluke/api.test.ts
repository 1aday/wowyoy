import { describe, expect, it } from "vitest"
import { handleGet, handleOptions, handlePost } from "./api"
import { TokenBuckets } from "./rate-limit"

const get = (q: string, ip = "10.0.0.1", buckets = new TokenBuckets()) =>
  handleGet(new Request(`https://wowyoy.com/api/fluke?${q}`, { headers: { "x-forwarded-for": `${ip}, 10.9.9.9` } }), buckets)

const post = (body: unknown, buckets = new TokenBuckets()) =>
  handlePost(
    new Request("https://wowyoy.com/api/fluke", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.2" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    buckets,
  )

describe("GET /api/fluke", () => {
  it("answers the two-number test with the page's verdict and a share url", async () => {
    const res = await get("kind=rate&volume=800&before=4.1&after=3.6")
    expect(res.status).toBe(200)
    expect(res.headers.get("access-control-allow-origin")).toBe("*")
    expect(res.headers.get("cache-control")).toContain("max-age")
    const body = await res.json()
    expect(body).toMatchObject({
      test: "two-weeks",
      call: "noise",
      headline: "Within noise.",
      floor: { label: "±1.9 pt" },
      inputs: { kind: "rate", before: 4.1, after: 3.6, volume: 800 },
      url: "https://wowyoy.com/fluke/rate/800/4.1/3.6",
    })
    expect(body.reason).toContain("chance alone moves a rate around 3.85% by ±1.9 pt")
    expect(body.oneInWeeks).toBe(2)
  })

  it("reads typed numbers: 4.1%, 1,184, $412k", async () => {
    const body = await (await get("kind=amount&volume=13%2C000&before=%24412k&after=%24447k")).json()
    expect(body).toMatchObject({ call: "real", inputs: { before: 412000, after: 447000, volume: 13000 } })
  })

  it("runs the history test from comma-separated values", async () => {
    const body = await (await get("values=3410,3520,3388,3602,3455,3498,3371,3540,3467,3512,3430,3566,2904,3488&name=Orders")).json()
    expect(body).toMatchObject({ test: "history", call: "rebound", headline: "Back to normal." })
    expect(body.url).toContain("v=3410")
  })

  it("says what is wrong with bad input, and never caches it", async () => {
    const cases: [string, RegExp][] = [
      ["kind=ratio&before=1&after=2", /kind must be rate, count, amount or average/],
      ["kind=rate&before=4.1&after=3.6", /volume is required: trials a week/],
      ["kind=rate&volume=800&before=four&after=3.6", /before must be a number/],
      ["kind=rate&volume=800&before=104&after=3.6", /between 0% and 100%/],
      ["values=1,2,3", /at least 6 weeks/],
      ["", /kind/],
    ]
    for (const [q, msg] of cases) {
      const res = await get(q)
      expect(res.status, q).toBe(400)
      expect(res.headers.get("cache-control")).toBe("no-store")
      expect((await res.json()).error, q).toMatch(msg)
    }
  })
})

describe("POST /api/fluke", () => {
  it("judges two numbers sent as JSON", async () => {
    const res = await post({ kind: "count", before: 1184, after: 1402 })
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toMatchObject({ call: "real", headline: "Real move.", url: "https://wowyoy.com/fluke/count/1184/1402" })
  })

  it("passes cv through for amounts and averages", async () => {
    const body = await (await post({ kind: "average", before: "$31.70", after: "$33.20", volume: 13000, cv: 0.9 })).json()
    expect(body).toMatchObject({ call: "real", inputs: { cv: 0.9 }, url: "https://wowyoy.com/fluke/average/13000/31.7/33.2?cv=0.9" })
  })

  it("judges a pasted history", async () => {
    const values = [
      "62.1%",
      "61.4%",
      "62.6%",
      "61.9%",
      "62.8%",
      "61.7%",
      "61.2%",
      "62.5%",
      "62.3%",
      "61.5%",
      "62.0%",
      "62.9%",
      "61.8%",
      "59.1%",
    ]
    const body = await (await post({ values, name: "Checkout completion" })).json()
    expect(body).toMatchObject({ test: "history", call: "real", headline: "Real move.", inputs: { unit: "%" } })
    expect(body.url).toContain("u=pct")
  })

  it("rejects bodies that aren't a JSON object", async () => {
    for (const b of ["{nope", "[1,2]", "null", JSON.stringify({ values: [1, "x", 3, 4, 5, 6] })]) {
      const res = await post(b)
      expect(res.status, b).toBe(400)
      expect((await res.json()).error).toBeTruthy()
    }
  })
})

describe("CORS and rate limit", () => {
  it("answers the preflight", () => {
    const res = handleOptions()
    expect(res.status).toBe(204)
    expect(res.headers.get("access-control-allow-methods")).toContain("POST")
  })

  it("limits each IP separately, with Retry-After", async () => {
    const buckets = new TokenBuckets(2, 0.5)
    const q = "kind=count&before=10&after=12"
    expect((await get(q, "1.1.1.1", buckets)).status).toBe(200)
    expect((await get(q, "1.1.1.1", buckets)).status).toBe(200)
    const third = await get(q, "1.1.1.1", buckets)
    expect(third.status).toBe(429)
    expect(third.headers.get("retry-after")).toBe("2")
    expect((await get(q, "2.2.2.2", buckets)).status).toBe(200)
  })

  it("refills over time", () => {
    const b = new TokenBuckets(1, 1)
    expect(b.take("a", 0)).toBe(0)
    expect(b.take("a", 100)).toBe(1)
    expect(b.take("a", 1200)).toBe(0)
  })
})
