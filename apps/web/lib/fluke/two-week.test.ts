import { describe, expect, it } from "vitest"
import { allSpecs } from "@workspace/metrics"
import { embedPrefill } from "./embed"
import { parseNumber } from "./number"
import { fromText, parseTwoWeekPath, plain, runTwoWeek, toText, twoWeekPath, twoWeekPresets, type TwoWeekReport } from "./two-week"

const ok = (r: ReturnType<typeof runTwoWeek>) => {
  if ("error" in r) throw new Error(r.error)
  return r as TwoWeekReport
}

describe("parseNumber", () => {
  it("reads numbers the way people type them", () => {
    expect(parseNumber("4.1%")).toBe(4.1)
    expect(parseNumber("1,184")).toBe(1184)
    expect(parseNumber("$412k")).toBe(412000)
    expect(parseNumber(" 1.3M ")).toBe(1300000)
    expect(parseNumber("4,1")).toBe(4.1)
    expect(parseNumber("−3")).toBe(-3)
    expect(parseNumber(".5")).toBe(0.5)
  })

  it("refuses anything else", () => {
    for (const s of ["", "abc", "1,18,4", "4.1.2", "12kk", "1e5", "NaN"]) expect(parseNumber(s), s).toBeNull()
  })
})

describe("two-number report", () => {
  it("explains the worked example in plain words", () => {
    const r = ok(runTwoWeek({ kind: "rate", volume: 800, before: 4.1, after: 3.6 }))
    expect(r.call).toBe("noise")
    expect(r.floor!.label).toBe("±1.9 pt")
    expect(plain(r.explain[0]!)).toBe("At 800 a week, chance alone moves a rate around 3.85% by ±1.9 pt or more about once in 22 weeks.")
    expect(plain(r.explain[1]!)).toBe("This move is ▼0.50 pt: chance makes one this big about every other week.")
    expect(r.path).toBe("/fluke/rate/800/4.1/3.6")
  })

  it("calls the presets the way their names promise", () => {
    expect(ok(runTwoWeek(twoWeekPresets.count)).call).toBe("real")
    expect(ok(runTwoWeek(twoWeekPresets.amount)).call).toBe("real")
    expect(ok(runTwoWeek(twoWeekPresets.average)).call).toBe("noise")
  })

  it("says too few to say below the minimum volume, with no floor", () => {
    const r = ok(runTwoWeek({ kind: "rate", volume: 12, before: 40, after: 20 }))
    expect(r.call).toBe("too-few")
    expect(r.floor).toBeNull()
  })

  it("rejects inputs it can't test", () => {
    expect(runTwoWeek({ kind: "rate", volume: 800, before: 140, after: 3 })).toHaveProperty("error")
    expect(runTwoWeek({ kind: "amount", before: 1, after: 2 })).toHaveProperty("error")
    expect(runTwoWeek({ kind: "count", before: -1, after: 2 })).toHaveProperty("error")
  })

  it("reads the form and writes it back", () => {
    const t = toText(twoWeekPresets.amount)
    expect(t).toMatchObject({ before: "412,000", after: "447,000", volume: "13,000" })
    expect(fromText({ ...t, before: "$412k" }).values).toEqual(twoWeekPresets.amount)
    expect(fromText({ ...t, volume: "" }).errors.volume).toBe("Required.")
  })
})

describe("share paths", () => {
  it("round-trip", () => {
    for (const v of Object.values(twoWeekPresets)) expect(parseTwoWeekPath(twoWeekPath(v).split("/").slice(2))).toEqual(v)
    const cv = { kind: "average" as const, volume: 900, before: 31.7, after: 33.2, cv: 0.8 }
    const [path, q] = twoWeekPath(cv).split("?")
    expect(path).toBe("/fluke/average/900/31.7/33.2")
    expect(parseTwoWeekPath(path!.split("/").slice(2), new URLSearchParams(q).get("cv"))).toEqual(cv)
  })

  it("parse strictly", () => {
    const bad = [
      ["rate", "800", "4.1"],
      ["rate", "800", "4.1", "3.6", "1"],
      ["rate", "800.5", "4.1", "3.6"],
      ["rate", "0", "4.1", "3.6"],
      ["rate", "800", "104", "3.6"],
      ["rate", "800", "4,1", "3.6"],
      ["rate", "800", "-4", "3.6"],
      ["rate", "800", "1e3", "3.6"],
      ["count", "1184"],
      ["count", "01184", "1402"],
      ["ratio", "1", "2"],
      [],
    ]
    for (const s of bad) expect(parseTwoWeekPath(s), s.join("/")).toBeNull()
    expect(parseTwoWeekPath(["amount", "13000", "412000", "447000"], "zero")).toBeNull()
  })
})

describe("embed pre-fill", () => {
  it("fits every spec: a real move on Why pages, noise on the Standard", () => {
    for (const spec of allSpecs()) {
      const plainFill = embedPrefill(spec, undefined, "2026-10-12")
      const down = embedPrefill(spec, "dropped", "2026-10-12")
      const up = embedPrefill(spec, "spiked", "2026-10-12")
      if (spec.noise.type === "process") {
        expect(plainFill.mode, spec.id).toBe("history")
        continue
      }
      if (down.mode !== "two-weeks" || up.mode !== "two-weeks" || plainFill.mode !== "two-weeks") throw new Error(spec.id)
      expect(down.values.after).toBeLessThan(down.values.before)
      expect(up.values.after).toBeGreaterThan(up.values.before)
      expect(ok(runTwoWeek(down.values)).call, spec.id).toBe("real")
      expect(ok(runTwoWeek(up.values)).call, spec.id).toBe("real")
      expect(ok(runTwoWeek(plainFill.values)).call, spec.id).toBe("noise")
    }
  })

  it("moves a process metric in the page's direction", () => {
    const mrr = allSpecs().find((s) => s.noise.type === "process")!
    const down = embedPrefill(mrr, "dropped", "2026-10-12")
    if (down.mode !== "history") throw new Error("expected history")
    expect(down.history).toHaveLength(26)
    expect(down.after).toBeLessThan(down.before)
  })
})
