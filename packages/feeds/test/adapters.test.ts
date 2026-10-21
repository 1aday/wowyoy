import { describe, expect, it } from "vitest"
import { parseWeekId, type IsoWeek } from "@workspace/metrics"
import apple from "../fixtures/apple-releases.json" with { type: "json" }
import cloudflare from "../fixtures/cloudflare-history-1.json" with { type: "json" }
import googleAds from "../fixtures/google-ads-incidents.json" with { type: "json" }
import googleSearch from "../fixtures/google-search-incidents.json" with { type: "json" }
import meta from "../fixtures/meta-ads-manager-history.json" with { type: "json" }
import stripe from "../fixtures/stripe-history-1.json" with { type: "json" }
import cloudflareApi from "../fixtures/cloudflare-incidents.json" with { type: "json" }
import { appleEvents, appleItems } from "../src/adapters/apple"
import { dstEvents, holidayEvents, shoppingEvents } from "../src/adapters/calendar"
import { googleAdsEvents, googleSearchEvents, type GoogleIncident } from "../src/adapters/google-status"
import { metaEvents, type MetaOutage } from "../src/adapters/meta-status"
import { historyPages, parseHistoryTimestamp, statuspageApiEvents, statuspageEvents, statuspageSites } from "../src/adapters/statuspage"
import { FIXTURES_RECORDED_AT, fixtureFetch } from "../src/fixtures"
import { feedInfo } from "../src/info"
import { pullWeek, pullWeeks } from "../src/pull"
import type { FetchInit } from "../src/source"
import { feedIds, type WorldEvent } from "../src/types"

const week = (id: string) => parseWeekId(id) as IsoWeek
const now = FIXTURES_RECORDED_AT

/** The WorldEvent contract every adapter must meet. */
function expectContract(events: WorldEvent[]) {
  for (const e of events) {
    expect(e.id).toMatch(new RegExp(`^${e.feed}:`))
    expect(feedIds).toContain(e.feed)
    expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    if (e.end) expect(e.end >= e.date).toBe(true)
    expect(e.title.length).toBeGreaterThan(0)
    expect(e.url).toMatch(/^https:\/\//)
    expect(["minor", "major", "critical"]).toContain(e.severity)
    expect(e.affects).toEqual(feedInfo[e.feed].affects)
  }
}

describe("statuspage", () => {
  it("parses one-day, same-day range and cross-month timestamps", () => {
    const oct = { name: "October", year: 2026 }
    expect(parseHistoryTimestamp("Oct <var data-var='date'>2</var>, <var data-var='time'>21:46</var> - <var data-var='time'>21:57</var> UTC", oct)).toEqual({
      date: "2026-10-02",
      end: "2026-10-02",
    })
    expect(parseHistoryTimestamp("Oct <var data-var='date'>21</var>, <var data-var='time'>02:00</var> UTC", oct)).toEqual({ date: "2026-10-21", end: "2026-10-21" })
    const aug = { name: "August", year: 2025 }
    expect(
      parseHistoryTimestamp("Jul <var data-var='date'>31</var>, <var data-var='time'>16:00</var> - Aug <var data-var='date'>1</var>, <var data-var='time'>00:00</var> UTC", aug),
    ).toEqual({ date: "2025-07-31", end: "2025-08-01" })
    const jan = { name: "January", year: 2026 }
    expect(parseHistoryTimestamp("Dec <var data-var='date'>31</var>, <var data-var='time'>23:00</var> - Jan <var data-var='date'>1</var>, <var data-var='time'>01:00</var> UTC", jan)).toEqual({
      date: "2025-12-31",
      end: "2026-01-01",
    })
    expect(parseHistoryTimestamp("sometime", oct)).toBeNull()
  })

  it("maps Cloudflare impacts and drops maintenance and none", () => {
    const events = statuspageEvents(statuspageSites.cloudflare, cloudflare)
    expectContract(events)
    expect(events.some((e) => e.title.startsWith("[Scheduled]"))).toBe(false)
    const cdn = events.find((e) => e.id === "cloudflare:2xnmsnv8yv5x")
    expect(cdn).toMatchObject({ date: "2026-10-02", severity: "critical", url: "https://www.cloudflarestatus.com/incidents/2xnmsnv8yv5x" })
    const raw = cloudflare.months.flatMap((m) => m.incidents).filter((i) => ["minor", "major", "critical"].includes(i.impact))
    expect(events).toHaveLength(raw.length)
  })

  it("maps Stripe incidents", () => {
    const events = statuspageEvents(statuspageSites.stripe, stripe)
    expectContract(events)
    expect(events.find((e) => e.severity === "major")?.url).toMatch(/^https:\/\/www\.stripestatus\.com\/incidents\//)
  })

  it("reads the v2 incident list with exact dates", () => {
    const events = statuspageApiEvents(statuspageSites.cloudflare, cloudflareApi)
    expectContract(events)
    expect(events.find((e) => e.id === "cloudflare:0eqtn0khkz87")).toMatchObject({ date: "2026-10-20", severity: "critical", title: "Cloudflare Zero Trust connectivity" })
    const none = new Set(cloudflareApi.incidents.filter((i) => i.impact === "none").map((i) => `cloudflare:${i.id}`))
    expect(events.some((e) => none.has(e.id))).toBe(false)
  })

  it("merges the newest incidents the history hasn't listed yet", async () => {
    const [res] = await pullWeek(week("2026-w43"), { fetch: fixtureFetch, now, feeds: ["cloudflare"] })
    const ids = res!.events.map((e) => e.id)
    expect(ids).toContain("cloudflare:0eqtn0khkz87")
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("picks the history pages that cover a range", () => {
    expect(historyPages({ from: "2026-10-12", to: "2026-10-18" }, now)).toEqual([1])
    expect(historyPages({ from: "2026-07-27", to: "2026-08-02" }, now)).toEqual([1, 2])
    expect(historyPages({ from: "2025-11-24", to: "2025-11-30" }, now)).toEqual([4])
    expect(() => historyPages({ from: "2020-01-06", to: "2020-01-12" }, now)).toThrow(/out of reach/)
  })
})

describe("google status", () => {
  it("treats every announced ranking update as major", () => {
    const events = googleSearchEvents(googleSearch as GoogleIncident[])
    expectContract(events)
    const core = events.find((e) => e.title === "March 2026 core update")
    expect(core).toMatchObject({ date: "2026-03-27", end: "2026-04-08", severity: "major", url: expect.stringContaining("status.search.google.com/incidents/") })
    const serving = events.find((e) => e.title.startsWith("Search serving"))
    expect(serving).toMatchObject({ title: "Search serving disruption", severity: "major" })
  })

  it("keeps only advertiser products from the ads dashboard", () => {
    const list = googleAds as GoogleIncident[]
    expect(googleAdsEvents(list)).toHaveLength(0)
    const ads = { ...list[0]!, affected_products: [{ title: "Google Ads", id: "x" }], severity: "high", status_impact: "SERVICE_OUTAGE" }
    const [e] = googleAdsEvents([ads])
    expect(e).toMatchObject({ feed: "ad-platforms", title: "Google Ads outage", severity: "critical", source: "Google Ads Status" })
    expectContract([e!])
  })
})

describe("meta status", () => {
  it("maps ads delivery levels directly and the rest one level down", () => {
    const events = metaEvents(meta as MetaOutage[])
    expectContract(events)
    const first = events[0]!
    expect(first).toMatchObject({ date: "2026-09-22", end: "2026-09-22", title: "Meta ads delivery disruption", severity: "major" })
    const high = events.find((e) => e.id === "ad-platforms:meta:1784454446180877")
    expect(high?.severity).toBe("critical")
    const creation = metaEvents([{ id: 1, org_id: "ads-manager", service_id: 5, status: "Resolved", time: "", posts: [{ id: 1, status: "High disruptions", time: "2026-01-01T00:00:00Z" }] }])
    expect(creation[0]?.severity).toBe("major")
  })
})

describe("apple", () => {
  it("keeps public iOS releases only", () => {
    const items = appleItems(apple.body)
    expect(items.length).toBeGreaterThan(10)
    const events = appleEvents(items)
    expectContract(events)
    expect(events.every((e) => /^iOS \d/.test(e.title))).toBe(true)
    expect(events.some((e) => /beta|RC/.test(e.title))).toBe(false)
    expect(events.find((e) => e.title === "iOS 27.0.1 released")?.severity).toBe("minor")
  })

  it("rates major and feature releases major, older lines minor", () => {
    const rss = (title: string, date: string) => `<item><title>${title}</title><link>https://developer.apple.com/news/releases/?id=${title.length}</link><pubDate>${date}</pubDate></item>`
    const items = appleItems(rss("iOS 27.1 (24B90)", "Mon, 02 Nov 2026 10:00:00 PST") + rss("iOS 26.7.2 (23H40)", "Mon, 02 Nov 2026 10:00:00 PST"))
    const [a, b] = appleEvents(items)
    expect(a).toMatchObject({ title: "iOS 27.1 released", severity: "major", date: "2026-11-02" })
    expect(b?.severity).toBe("minor")
  })
})

describe("computed feeds", () => {
  it("groups public holidays across countries", () => {
    const christmas = holidayEvents({ from: "2025-12-22", to: "2025-12-28" }).find((e) => e.date === "2025-12-25" && e.title === "Christmas Day")
    expect(christmas?.regions?.length).toBeGreaterThanOrEqual(10)
    expect(christmas?.regions).toContain("US")
    const thanksgiving = holidayEvents({ from: "2025-11-24", to: "2025-11-30" }).find((e) => e.title === "Thanksgiving Day")
    expect(thanksgiving).toMatchObject({ date: "2025-11-27", regions: ["US"], severity: "major" })
    expectContract(holidayEvents({ from: "2026-01-01", to: "2026-12-31" }))
  })

  it("puts Black Friday, Cyber Monday and extras on the shopping calendar", () => {
    const nov = shoppingEvents({ from: "2025-11-24", to: "2025-12-07" })
    expect(nov.map((e) => [e.date, e.title, e.severity])).toEqual([
      ["2025-11-28", "Black Friday", "critical"],
      ["2025-12-01", "Cyber Monday", "critical"],
    ])
    const dec = shoppingEvents({ from: "2026-12-14", to: "2026-12-20" })
    expect(dec.find((e) => e.title === "Super Saturday")?.date).toBe("2026-12-19")
    expect(shoppingEvents({ from: "2026-11-02", to: "2026-11-08" }).find((e) => e.title === "Diwali")?.regions).toEqual(["IN"])
    expectContract(shoppingEvents({ from: "2026-01-01", to: "2026-12-31" }))
  })

  it("dates the US and EU clock changes", () => {
    expect(dstEvents({ from: "2026-01-01", to: "2026-12-31" }).map((e) => [e.date, e.regions?.[0]])).toEqual([
      ["2026-03-08", "US"],
      ["2026-11-01", "US"],
      ["2026-03-29", "EU"],
      ["2026-10-25", "EU"],
    ])
  })
})

describe("pullWeek", () => {
  it("reads every feed from fixtures", async () => {
    const res = await pullWeek(week("2026-w40"), { fetch: fixtureFetch, now })
    expect(res.map((r) => r.feed)).toEqual([...feedIds])
    expect(res.every((r) => r.status === "ok")).toBe(true)
    const cf = res.find((r) => r.feed === "cloudflare")!
    expect(cf.events.find((e) => e.severity === "critical")?.title).toBe("Cloudflare CDN experiencing increase in errors.")
  })

  it("passes Next's revalidate and a timeout signal to fetch", async () => {
    const seen: { url: string; init?: FetchInit }[] = []
    await pullWeek(week("2026-w40"), {
      now,
      fetch: async (url: string, init?: FetchInit) => {
        seen.push({ url, init })
        return fixtureFetch(url, init)
      },
    })
    expect(seen.length).toBe(8)
    for (const s of seen) {
      expect(s.init?.next?.revalidate).toBeGreaterThan(0)
      expect(s.init?.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it("reports a failing source as unavailable, never as stale events", async () => {
    const res = await pullWeek(week("2026-w40"), { now, fetch: async () => new Response("down", { status: 503 }) })
    for (const id of ["stripe", "cloudflare", "google-search", "app-stores", "ad-platforms"] as const) {
      const r = res.find((x) => x.feed === id)!
      expect(r.status).toBe("unavailable")
      expect(r.events).toEqual([])
      expect(r.error).toMatch(/503/)
    }
    expect(res.find((x) => x.feed === "holidays")?.status).toBe("ok")
  })

  it("times out a source that hangs", async () => {
    const hang = (_: string, init?: FetchInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))
    const res = await pullWeek(week("2026-w40"), { now, fetch: hang, timeoutMs: 20, feeds: ["cloudflare"] })
    expect(res[0]).toMatchObject({ feed: "cloudflare", status: "unavailable", events: [] })
  })

  it("marks weeks before a source's history as unavailable", async () => {
    const [old, recent] = await pullWeeks([week("2025-w40"), week("2026-w38")], { now, fetch: fixtureFetch, feeds: ["google-search", "app-stores"] })
    expect(old!.map((r) => r.status)).toEqual(["unavailable", "unavailable"])
    expect(old![0]!.error).toMatch(/history starts/)
    expect(recent!.map((r) => r.status)).toEqual(["ok", "ok"])
  })

  it("keeps a multi-week ranking update in every week it touches", async () => {
    const [a, b] = await pullWeeks([week("2026-w13"), week("2026-w15")], { now, fetch: fixtureFetch, feeds: ["google-search"] })
    expect(a![0]!.events.map((e) => e.title)).toContain("March 2026 core update")
    expect(b![0]!.events.map((e) => e.title)).toContain("March 2026 core update")
  })
})
