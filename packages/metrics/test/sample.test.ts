import { describe, expect, it } from "vitest"
import { catalog, generateStore, pulse, verdict } from "../src"

const rows = generateStore({ endWeek: "2026-10-05" })

describe("sample store", () => {
  it("is deterministic and the right size", () => {
    expect(rows).toHaveLength(160)
    expect(generateStore({ endWeek: "2026-10-05" })[100]!.values.revenue).toBe(rows[100]!.values.revenue)
    const rev = rows.at(-1)!.values.revenue
    expect(rev).toBeGreaterThan(900_000)
    expect(rev).toBeLessThan(2_000_000)
  })

  it("flags a sensible share of moves as beyond noise", () => {
    let sig = 0
    let total = 0
    for (let i = 60; i < rows.length; i++) {
      for (const r of pulse(rows, i, catalog.map((m) => m.id))) {
        for (const d of Object.values(r.deltas)) {
          if (!d) continue
          total++
          if (d.significant) sig++
        }
      }
    }
    const share = sig / total
    expect(share).toBeGreaterThan(0.02)
    expect(share).toBeLessThan(0.2)
  })

  it("writes a headline for every week", () => {
    for (let i = 60; i < rows.length; i++) {
      const v = verdict(rows, i)
      expect(v.text.length).toBeGreaterThan(10)
      expect(v.text).toMatch(/\.$/)
    }
  })
})
