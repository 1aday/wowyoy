import { allSpecs, dialects } from "@workspace/metrics"
import { describe, expect, it } from "vitest"
import { callTool, resolveMetric, tools } from "../src"

const specs = allSpecs()
const call = (name: string, args: unknown) => callTool(name, args, specs)
const sc = (r: ReturnType<typeof call>) => r.structuredContent as Record<string, any>

describe("resolveMetric", () => {
  it("finds a metric by id, alias, name or catalog id", () => {
    expect(resolveMetric("checkout-conversion", specs)?.id).toBe("checkout-conversion")
    expect(resolveMetric("Checkout completion rate", specs)?.id).toBe("checkout-conversion")
    expect(resolveMetric("  checkout CONVERSION ", specs)?.id).toBe("checkout-conversion")
    expect(resolveMetric("checkout_completion_rate", specs)?.id).toBe("checkout-conversion")
    expect(resolveMetric("MRR", specs)?.id).toBe("mrr")
    expect(resolveMetric("Monthly recurring revenue", specs)?.id).toBe("mrr")
    expect(resolveMetric("nonsense", specs)).toBeNull()
    expect(resolveMetric("", specs)).toBeNull()
  })
})

describe("tool definitions", () => {
  it("lists define, query and fluke with object schemas and read-only hints", () => {
    expect(tools.map((t) => t.name)).toEqual(["define", "query", "fluke"])
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object")
      expect(t.annotations.readOnlyHint).toBe(true)
      expect(t.description.length).toBeGreaterThan(80)
      expect(t.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/)
    }
  })
})

describe("define", () => {
  for (const spec of specs) {
    it(spec.id, () => {
      const r = call("define", { metric: spec.name })
      expect(r.isError).toBe(false)
      const s = sc(r)
      expect(s.id).toBe(spec.id)
      expect(s.formula).toBe(spec.definition.formula)
      expect(s.pitfalls).toEqual(spec.prose.pitfalls)
      expect(s.events.map((e: { name: string }) => e.name)).toEqual(spec.events.map((e) => e.name))
      expect(s.source).toBe(`https://wowyoy.com/m/${spec.id}`)
      expect(r.content[0]!.text).toContain(`Source: https://wowyoy.com/m/${spec.id}`)
    })
  }

  it("suggests close ids for an unknown metric", () => {
    const r = call("define", { metric: "checkout rate thing" })
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("checkout-conversion")
  })

  it("explains when nothing is published", () => {
    const r = callTool("define", { metric: "mrr" }, [])
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("being reviewed")
  })
})

describe("query", () => {
  it("returns every spec's query in every dialect, with the schema it reads", () => {
    for (const spec of specs) {
      for (const dialect of dialects) {
        const r = call("query", { metric: spec.id, dialect })
        expect(r.isError, `${spec.id} ${dialect}`).toBe(false)
        const s = sc(r)
        expect(s.sql).toContain("SELECT")
        expect(s.schema.table).toBe("events")
        expect(s.source).toBe(`https://wowyoy.com/m/${spec.id}`)
        expect(r.content[0]!.text).toContain("```sql")
      }
    }
  })

  it("splits by a property and takes a week count", () => {
    const s = sc(call("query", { metric: "checkout-conversion", dialect: "bigquery", breakdown: "$device_type", weeks: 8 }))
    expect(s.sql).toContain(`'$."$device_type"'`)
    expect(s.sql).toContain("INTERVAL 8 WEEK")
  })

  it("rejects bad input with a message the model can act on", () => {
    expect(call("query", { metric: "mrr", dialect: "mysql" }).content[0]!.text).toContain("hogql, postgres, bigquery, snowflake")
    expect(call("query", { metric: "mrr", dialect: "postgres", breakdown: "a'; DROP TABLE x" }).isError).toBe(true)
    expect(call("query", { metric: "mrr", dialect: "postgres", weeks: 0 }).isError).toBe(true)
    expect(call("query", { metric: "mrr", dialect: "postgres", breakdown: "plan" }).content[0]!.text).toContain("hand-written")
    expect(call("query", { metric: "mrr", dialect: "postgres", extra: 1 }).content[0]!.text).toContain("Unknown argument: extra")
  })
})

describe("fluke", () => {
  it("reads rates given as percents or fractions the same way", () => {
    const a = sc(call("fluke", { kind: "rate", before: 4.1, after: 3.6, volume: 800 }))
    const b = sc(call("fluke", { kind: "rate", before: 0.041, after: 0.036, volume: 800 }))
    expect(a.call).toBe(b.call)
    expect(a.floor).toBeCloseTo(b.floor, 12)
    expect(a.fluke_url).toBe("https://wowyoy.com/fluke/rate/800/4.1/3.6")
    expect(a.source).toBe("https://wowyoy.com/fluke")
  })

  it("infers the kind and spread from a metric", () => {
    const rate = call("fluke", { metric: "checkout-conversion", before: 0.62, after: 0.55, volume: 9000 })
    expect(sc(rate).kind).toBe("rate")
    expect(sc(rate).call).toBe("real")
    expect(rate.content[0]!.text).toContain("Source: https://wowyoy.com/m/checkout-conversion")
    const money = sc(call("fluke", { metric: "net-revenue", before: 412000, after: 418000, volume: 13000 }))
    expect(money.kind).toBe("amount")
    expect(money.call).toBe("noise")
    expect(money.fluke_url).toBe("https://wowyoy.com/fluke/amount/13000/412000/418000?cv=0.9")
    const count = sc(call("fluke", { kind: "count", before: 1184, after: 1402 }))
    expect(count.call).toBe("real")
    expect(count.fluke_url).toBe("https://wowyoy.com/fluke/count/1184/1402")
  })

  it("judges averages with the mean model", () => {
    const aov = specs.find((s) => s.noise.type === "mean")
    const r = aov
      ? call("fluke", { metric: aov.id, before: 31.7, after: 33.2, volume: 1300 })
      : call("fluke", { kind: "average", before: 31.7, after: 33.2, volume: 1300 })
    expect(r.isError).toBe(false)
    expect(sc(r).kind).toBe("average")
  })

  it("says why two numbers can't settle a process metric", () => {
    const r = call("fluke", { metric: "mrr", before: 240000, after: 236000 })
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("no sampling floor")
  })

  it("asks for what's missing", () => {
    expect(call("fluke", { before: 1, after: 2 }).content[0]!.text).toContain('"kind"')
    expect(call("fluke", { kind: "rate", before: 4, after: 3 }).content[0]!.text).toContain('"volume" is required')
    expect(call("fluke", { kind: "count", before: "a", after: 2 }).isError).toBe(true)
    expect(call("fluke", { kind: "count", before: 5, after: 2, volume: -1 }).isError).toBe(true)
    expect(call("nope", {}).isError).toBe(true)
    expect(call("fluke", [1, 2]).isError).toBe(true)
  })
})
