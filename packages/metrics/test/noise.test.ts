import { describe, expect, it } from "vitest"
import {
  alignYoy,
  allSpecs,
  bandAtVolumes,
  easter,
  exampleSeries,
  isoWeekOf,
  judge,
  latestClosedWeek,
  parseWeekId,
  rng,
  samplingFloor,
  twoWeekKindFor,
  twoWeekTest,
  volumeToDetect,
} from "../src"

describe("sampling floor", () => {
  it("is ±2√2/√N for a count: 800 a week moves about ±10% on chance alone", () => {
    expect(samplingFloor("poisson", 800, 800)! / 800).toBeCloseTo((2 * Math.SQRT2) / Math.sqrt(800), 6)
    expect(samplingFloor("poisson", 800, 800)! / 800).toBeCloseTo(0.1, 2)
  })

  it("is 2√2·√(p(1−p)/n) for a rate", () => {
    const f = samplingFloor("binomial", 0.04, 800)!
    expect(f).toBeCloseTo(2 * Math.SQRT2 * Math.sqrt((0.04 * 0.96) / 800), 9)
  })

  it("has no sampling floor for process metrics", () => {
    expect(samplingFloor("process", 100, 100)).toBeNull()
    expect(bandAtVolumes({ type: "process", min_denominator: 1, typical: 1 }, [200])).toEqual([])
  })

  it("shrinks with √volume and inverts cleanly", () => {
    const spec = { type: "binomial" as const, min_denominator: 100, typical: 0.62 }
    const [a, b] = bandAtVolumes(spec, [800, 3200])
    expect(a!.absolute / b!.absolute).toBeCloseTo(2, 6)
    const v = volumeToDetect(spec, a!.relative)!
    expect(Math.abs(v - 800)).toBeLessThanOrEqual(1)
  })
})

describe("judge", () => {
  it("says too few to say below the minimum volume", () => {
    const v = judge([0.5, 0.2], { type: "binomial", min_denominator: 100 }, [40, 40])!
    expect(v.call).toBe("too-few")
  })

  it("calls pure sampling noise real rarely, close to the two-sided 5% rate", () => {
    const r = rng(9)
    let real = 0
    const trials = 4000
    for (let t = 0; t < trials; t++) {
      const n = 2000
      const p = 0.3
      const xs = Array.from({ length: 2 }, () => p + Math.sqrt((p * (1 - p)) / n) * r.normal())
      if (twoWeekTest({ kind: "rate", before: xs[0]!, after: xs[1]!, volume: n })!.call === "real") real++
    }
    expect(real / trials).toBeGreaterThan(0.025)
    expect(real / trials).toBeLessThan(0.075)
  })

  it("matches the plan's worked example: 800 sessions, 4.1% to 3.6% is noise", () => {
    expect(twoWeekTest({ kind: "rate", before: 0.041, after: 0.036, volume: 800 })!.call).toBe("noise")
    expect(twoWeekTest({ kind: "rate", before: 0.041, after: 0.026, volume: 8000 })!.call).toBe("real")
  })

  it("tests an average (AOV) against cv/√orders", () => {
    const v = twoWeekTest({ kind: "average", before: 31.7, after: 33.2, volume: 13000, cv: 0.9 })!
    expect(v.floor).toBeCloseTo(2 * Math.SQRT2 * ((32.45 * 0.9) / Math.sqrt(13000)), 9)
    expect(v.call).toBe("real")
    expect(twoWeekTest({ kind: "average", before: 31.7, after: 33.2, volume: 200, cv: 0.9 })!.call).toBe("noise")
    expect(twoWeekTest({ kind: "average", before: 31.7, after: 33.2, volume: 12 })!.call).toBe("too-few")
    expect(twoWeekTest({ kind: "average", before: 31.7, after: 33.2 })).toBeNull()
  })

  it("calls a pure-noise average real about 5% of the time", () => {
    const r = rng(21)
    let real = 0
    const trials = 4000
    for (let t = 0; t < trials; t++) {
      const n = 900
      const xs = [0, 1].map(() => 40 * (1 + (1.1 / Math.sqrt(n)) * r.normal()))
      if (twoWeekTest({ kind: "average", before: xs[0]!, after: xs[1]!, volume: n, cv: 1.1 })!.call === "real") real++
    }
    expect(real / trials).toBeGreaterThan(0.025)
    expect(real / trials).toBeLessThan(0.075)
  })

  it("maps every noise type with a sampling floor to a two-number kind", () => {
    expect(twoWeekKindFor("binomial")).toBe("rate")
    expect(twoWeekKindFor("poisson")).toBe("count")
    expect(twoWeekKindFor("compound")).toBe("amount")
    expect(twoWeekKindFor("mean")).toBe("average")
    expect(twoWeekKindFor("process")).toBeNull()
  })

  it("needs the floor and the process limits to agree before calling a move real", () => {
    const base = [620, 614, 626, 619, 628, 617, 612, 625, 623, 615, 620, 629, 618]
    // A big move that clears the process limits but not the sampling floor of a tiny volume.
    const v = judge([...base, 560], { type: "binomial", min_denominator: 10 }, [...base.map(() => 40), 40].map(() => 40))
    expect(v?.clearsProcess).toBe(true)
  })
})

describe("clock", () => {
  it("numbers ISO weeks, including year edges", () => {
    expect(isoWeekOf("2026-10-19").id).toBe("2026-w43")
    expect(isoWeekOf("2027-01-01").id).toBe("2026-w53")
    expect(isoWeekOf("2024-12-30").id).toBe("2025-w01")
    expect(parseWeekId("2026-W43")!.monday).toBe("2026-10-19")
    expect(parseWeekId("2025-w53")).toBeNull()
  })

  it("closes a week on the following Monday at 06:00 UTC", () => {
    expect(latestClosedWeek(new Date("2026-10-26T05:59:00Z")).id).toBe("2026-w42")
    expect(latestClosedWeek(new Date("2026-10-26T06:00:00Z")).id).toBe("2026-w43")
  })

  it("finds Easter and aligns Black Friday year over year", () => {
    expect(easter(2026)).toBe("2026-04-05")
    expect(easter(2027)).toBe("2027-03-28")
    const bf = alignYoy(isoWeekOf("2026-11-27"))
    expect(bf.event?.id).toBe("black-friday")
    expect(bf.base.monday <= "2025-11-28" && bf.base.sunday >= "2025-11-28").toBe(true)
  })
})

describe("specs and examples", () => {
  it("parses every spec and draws a stable example series", () => {
    const specs = allSpecs()
    expect(specs.length).toBeGreaterThan(0)
    for (const s of specs) {
      const a = exampleSeries(s, { end: "2026-10-12" })
      const b = exampleSeries(s, { end: "2026-10-12" })
      expect(a).toEqual(b)
      expect(a).toHaveLength(104)
      expect(a.at(-1)!.week).toBe("2026-10-12")
      expect(a.every((p) => Number.isFinite(p.value) && p.value >= 0)).toBe(true)
    }
  })
})

describe("edges of the two-week test", () => {
  it("never calls a flat week real, even at 0% or 100%", () => {
    for (const [kind, x] of [["rate", 0], ["rate", 1], ["amount", 0], ["average", 0], ["count", 40]] as const) {
      expect(twoWeekTest({ kind, before: x, after: x, volume: 800 })!.call, `${kind} ${x}`).not.toBe("real")
    }
    expect(twoWeekTest({ kind: "rate", before: 0, after: 0.05, volume: 800 })!.call).toBe("real")
  })

  it("only claims the process limits when it ran them", () => {
    const v = twoWeekTest({ kind: "rate", before: 0.041, after: 0.026, volume: 8000 })!
    expect(v.process).toBeNull()
    expect(v.reason).not.toMatch(/usual week-to-week range/)
  })

  it("honours a metric's own minimum volume", () => {
    expect(twoWeekTest({ kind: "rate", before: 0.6, after: 0.4, volume: 40 })!.call).not.toBe("too-few")
    expect(twoWeekTest({ kind: "rate", before: 0.6, after: 0.4, volume: 40, min_denominator: 100 })!.call).toBe("too-few")
  })
})
