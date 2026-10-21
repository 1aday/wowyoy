import { describe, expect, it } from "vitest"
import { flukeTest, normalCdf, parseSeries, rng } from "../src"

describe("parseSeries", () => {
  it("reads rates, counts with thousands separators and money with suffixes", () => {
    expect(parseSeries("62.1%, 61.4%, 62.6%")).toEqual({ values: [62.1, 61.4, 62.6], unit: "%" })
    expect(parseSeries("1,184 1,262\n1,091")).toEqual({ values: [1184, 1262, 1091], unit: "" })
    expect(parseSeries("$412k, $398k, $1.2M")).toEqual({ values: [412000, 398000, 1200000], unit: "$" })
  })
})

describe("flukeTest", () => {
  it("needs enough weeks to know what normal is", () => {
    expect(flukeTest([1, 2, 3])).toBeNull()
  })

  it("uses the two-week noise floor: pure noise is called a big swing about 1 in 22 weeks, not 1 in 6", () => {
    const r = rng(42)
    let big = 0
    let naive = 0
    const trials = 6000
    for (let t = 0; t < trials; t++) {
      const xs = Array.from({ length: 27 }, () => 100 + 5 * r.normal())
      const res = flukeTest(xs)!
      if (Math.abs(res.zChange) >= 2) big++
      // What a single-week floor would have said about the same change.
      if (Math.abs(res.change) >= 2 * res.sigma) naive++
    }
    expect(big / trials).toBeGreaterThan(0.025)
    expect(big / trials).toBeLessThan(0.08)
    expect(naive / trials).toBeGreaterThan(0.12)
  })

  it("calls a clear drop real and a return to normal a rebound", () => {
    const base = [62.1, 61.4, 62.6, 61.9, 62.8, 61.7, 61.2, 62.5, 62.3, 61.5, 62.0, 62.9, 61.8]
    expect(flukeTest([...base, 58.4])!.call).toBe("real")
    expect(flukeTest([...base, 58.4, 62.2])!.call).toBe("rebound")
    expect(flukeTest([...base, 62.0])!.call).toBe("fluke")
  })

  it("has a normal CDF that matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
    expect(normalCdf(-2)).toBeCloseTo(0.02275, 4)
  })
})
