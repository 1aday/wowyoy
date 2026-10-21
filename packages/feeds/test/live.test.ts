import { describe, expect, it } from "vitest"
import { latestClosedWeek, parseWeekId, shiftWeek, type IsoWeek } from "@workspace/metrics"
import { pullWeeks } from "../src/pull"

/** Reads the real sources. Off by default; run with FEEDS_LIVE=1 to check the endpoints still answer in shape. */
describe.runIf(process.env.FEEDS_LIVE === "1")("live sources", () => {
  it("answers for recent weeks", { timeout: 60_000 }, async () => {
    const latest = latestClosedWeek()
    const weeks = [latest, shiftWeek(latest, -2), parseWeekId("2025-w48") as IsoWeek]
    const res = await pullWeeks(weeks)
    for (const [i, w] of weeks.entries()) {
      for (const r of res[i]!) {
        const above = r.events.filter((e) => e.severity !== "minor")
        console.log(w.id, r.feed.padEnd(14), r.status.padEnd(11), `${r.events.length} events, ${above.length} above minor`, r.error ?? "", above.map((e) => `${e.date} ${e.severity} ${e.title}`).join(" | "))
      }
    }
    expect(res[0]!.filter((r) => r.status === "ok").length).toBe(8)
  })
})
