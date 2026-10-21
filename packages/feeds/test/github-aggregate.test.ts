import { describe, expect, it } from "vitest"
import { judge, latestClosedWeek } from "@workspace/metrics"
import {
  REPO_NOISE,
  badgeRead,
  bucketByWeek,
  commitsByWeek,
  headlineText,
  moveText,
  parseLink,
  pageOf,
  pulseWindow,
  readMeasure,
  repoHeadline,
  weekBands,
  weekCalls,
  type MeasureSeries,
} from "../src/github"
import commitSample from "../src/github/fixtures/samples/commit-activity.json" with { type: "json" }

const wed = new Date("2026-10-21T15:00:00Z")

describe("the window", () => {
  it("is the 26 latest closed weeks, then the open one", () => {
    const win = pulseWindow(wed)
    expect(win.closed).toBe(26)
    expect(win.weeks).toHaveLength(27)
    expect(win.weeks[25]!.id).toBe(latestClosedWeek(wed).id)
    expect(win.weeks[25]!.id).toBe("2026-w42")
    expect(win.weeks[26]!.id).toBe("2026-w43")
    expect(win.weeks[0]!.id).toBe("2026-w17")
  })

  it("keeps last week open until Monday 06:00 UTC", () => {
    const early = pulseWindow(new Date("2026-10-19T03:00:00Z"))
    expect(early.weeks.slice(-2).map((w) => w.id)).toEqual(["2026-w42", "2026-w43"])
    expect(early.weeks[early.closed - 1]!.id).toBe("2026-w41")
    const after = pulseWindow(new Date("2026-10-19T07:00:00Z"))
    expect(after.weeks[after.closed - 1]!.id).toBe("2026-w42")
    expect(after.weeks).toHaveLength(27)
  })
})

describe("bucketing", () => {
  const win = pulseWindow(wed)

  it("files each event under its ISO week, Monday to Sunday UTC", () => {
    const counts = bucketByWeek(["2026-10-12T00:00:00Z", "2026-10-18T23:59:59Z", "2026-10-19T00:00:00Z", "2026-04-19T23:59:59Z"], win)
    expect(counts[25]).toBe(2)
    expect(counts[26]).toBe(1)
    expect(counts.reduce<number>((a, b) => a + (b ?? 0), 0)).toBe(3)
  })

  it("leaves weeks before the oldest read event empty, not zero", () => {
    const counts = bucketByWeek(["2026-10-14T10:00:00Z"], win, Date.parse("2026-10-07T12:00:00Z"))
    expect(counts.slice(0, 25).every((c) => c == null)).toBe(true)
    expect(counts[25]).toBe(1)
  })

  it("re-files GitHub's Sunday weeks into ISO weeks day by day", () => {
    const counts = commitsByWeek(commitSample, pulseWindow(new Date("2025-10-22T12:00:00Z")))
    // Sample weeks start Sun Oct 5, 12 and 19, 2025 (05:00 UTC). ISO week Oct 6–12 = Mon–Sat of week 1 + Sunday of week 2.
    const win = pulseWindow(new Date("2025-10-22T12:00:00Z"))
    const i = win.weeks.findIndex((w) => w.monday === "2025-10-06")
    expect(counts[i]).toBe(31 + 28 + 26 + 33 + 22 + 3 + 2)
    expect(counts[i + 1]).toBe(29 + 34 + 30 + 27 + 25 + 5 + 6)
    expect(counts[i - 1]).toBeNull()
  })
})

describe("Link headers", () => {
  it("reads rel links and page numbers", () => {
    const l = parseLink(
      '<https://api.github.com/repositories/1/stargazers?per_page=100&page=293>; rel="prev", <https://api.github.com/repositories/1/stargazers?per_page=100&page=1>; rel="first"',
    )
    expect(pageOf(l.prev)).toBe(293)
    expect(pageOf(l.first)).toBe(1)
    expect(l.next).toBeUndefined()
  })
})

const series = (measure: MeasureSeries["measure"], counts: (number | null)[]): MeasureSeries => ({ measure, status: "ok", counts, note: null, requests: 0 })
const steady = [58, 61, 55, 64, 59, 67, 62, 57, 60, 66, 63, 58, 61, 69, 64, 60, 57, 65, 62, 59, 63, 68, 61, 64, 66]

describe("verdicts", () => {
  it("judge every closed week on the Poisson branch with the count as its volume", () => {
    const counts = [...steady, 98, 31]
    const calls = weekCalls(counts, 26)
    expect(calls[0]).toBeNull()
    expect(calls[26]).toBeNull()
    expect(calls[25]).toEqual(judge(counts.slice(0, 26), REPO_NOISE, counts.slice(0, 26)))
    expect(calls[25]!.call).toBe("real")
    expect(calls[24]!.call).not.toBe("real")
  })

  it("say too few under 10 a week", () => {
    const calls = weekCalls([2, 3, 1, 4, 2, 6, 1], 6)
    expect(calls[5]!.call).toBe("too-few")
  })

  it("start a fresh run after a gap", () => {
    const calls = weekCalls([null, null, 40, 44], 4)
    expect(calls[2]).toBeNull()
    expect(calls[3]!.before).toBe(40)
  })

  it("draw the band from the 13 closed weeks before each week", () => {
    const counts = [...steady, 98, 31]
    const bands = weekBands(counts, 26)
    expect(bands[12]).toBeNull()
    const xs = steady.slice(12, 25)
    const mean = xs.reduce((a, b) => a + b, 0) / 13
    expect(bands[25]![0]).toBeLessThan(mean)
    expect(bands[25]![1]).toBeGreaterThan(mean)
    expect(bands[25]![1]).toBeLessThan(98)
  })
})

describe("the words", () => {
  const pulse = (measures: MeasureSeries[]) => ({ closed: 26, measures: measures.map((m) => readMeasure(m, 26)) })

  it("names a single real move", () => {
    const p = pulse([series("stars", [...steady, 98, 31]), series("forks", [...steady.map((x) => x / 6).map(Math.round), 11, 4])])
    expect(headlineText(repoHeadline(p))).toBe("Stars ▲48%. A real move.")
    expect(repoHeadline(p)[1]).toEqual({ text: "▲48%", tone: "up" })
  })

  it("names two, then counts the rest", () => {
    const up = [...steady, 98, 31]
    const down = [...steady.map((x) => x * 2), 70, 20]
    expect(headlineText(repoHeadline(pulse([series("stars", up), series("prs-merged", down)])))).toMatch(/^Stars ▲48% and PRs merged ▼\d+%\. Both real\.$/)
    const three = pulse([series("stars", up), series("prs-merged", down), series("commits", [...steady.map((x) => x * 3), 330, 20])])
    expect(headlineText(repoHeadline(three))).toMatch(/^Commits ▲\d+% and 2 more real moves\.$/)
  })

  it("says so when nothing moved", () => {
    expect(headlineText(repoHeadline(pulse([series("stars", [...steady, 64, 30])])))).toBe("Nothing moved beyond noise this week.")
    expect(headlineText(repoHeadline(pulse([series("stars", [...steady.map(() => 2), 3, 1])])))).toBe("Too quiet to call this week.")
  })

  it("writes the badge from the latest closed week", () => {
    const p = pulse([series("stars", [...steady, 98, 31])])
    expect(badgeRead(p)).toMatchObject({ label: "stars", value: "48% WoW · real", dir: "up", tone: "real" })
    const quiet = pulse([series("stars", [...steady, 64, 30])])
    expect(badgeRead(quiet)).toMatchObject({ value: "3.0% WoW · noise", tone: "plain" })
    expect(badgeRead(quiet, "forks")).toMatchObject({ label: "forks", value: "no history yet", tone: "muted" })
  })

  it("prints a move from zero as a count", () => {
    expect(moveText({ before: 0, after: 12, relativeChange: 0 })).toBe("▲12")
    expect(moveText({ before: 50, after: 48, relativeChange: -0.04 })).toBe("▼4.0%")
  })
})
