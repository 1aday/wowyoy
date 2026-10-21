import Holidays from "date-holidays"
import { movingEvents } from "@workspace/metrics"
import { feedInfo } from "../info"
import { overlaps, type DateRange, type Loaded } from "../source"
import type { Severity, WorldEvent } from "../types"

/**
 * The computed feeds: public holidays, the shopping calendar and clock changes. No network, so
 * they are always available, and every date is reproducible from the code below.
 */

/** The markets the holidays feed reads, by ISO code. */
export const HOLIDAY_COUNTRIES = ["US", "GB", "CA", "AU", "DE", "FR", "NL", "ES", "IT", "JP", "IN", "BR", "MX"] as const

const years = (r: DateRange) => {
  const out: number[] = []
  for (let y = Number(r.from.slice(0, 4)); y <= Number(r.to.slice(0, 4)); y++) out.push(y)
  return out
}

const calendars = new Map<string, Holidays>()
const calendar = (country: string) => {
  let hd = calendars.get(country)
  if (!hd) calendars.set(country, (hd = new Holidays(country, { languages: ["en"], timezone: "UTC" })))
  return hd
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

/**
 * Nationwide public holidays (date-holidays type "public"; regional, bank-only and observance days
 * are left out), one event per day and name with every country that observes it. Severity: major,
 * since a day off moves daily traffic and orders in that market.
 */
export function holidayEvents(range: DateRange): WorldEvent[] {
  const grouped = new Map<string, WorldEvent>()
  for (const year of years(range)) {
    for (const country of HOLIDAY_COUNTRIES) {
      for (const h of calendar(country).getHolidays(year)) {
        if (h.type !== "public") continue
        const date = h.date.slice(0, 10)
        if (date < range.from || date > range.to) continue
        const key = `${date}:${slug(h.name)}`
        const existing = grouped.get(key)
        if (existing) {
          existing.regions!.push(country)
          continue
        }
        grouped.set(key, {
          id: `holidays:${key}`,
          feed: "holidays",
          date,
          end: null,
          source: "date-holidays",
          title: h.name,
          url: feedInfo.holidays.home,
          severity: "major",
          affects: feedInfo.holidays.affects,
          regions: [country],
        })
      }
    }
  }
  return [...grouped.values()]
}

/** The nth weekday (0 = Sunday) of a month; n = -1 for the last. */
function nthWeekday(year: number, month: number, weekday: number, n: number) {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay()
    return new Date(Date.UTC(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7)).toISOString().slice(0, 10)
  }
  const last = new Date(Date.UTC(year, month + 1, 0))
  return new Date(Date.UTC(year, month, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7))).toISOString().slice(0, 10)
}

/** Diwali (Lakshmi Puja), which follows the lunar calendar. */
const diwali: Record<number, string> = { 2024: "2024-11-01", 2025: "2025-10-20", 2026: "2026-11-08", 2027: "2027-10-29" }

interface Shopping {
  id: string
  name: string
  date: string
  regions: string[]
  severity: Severity
}

/** Shopping days beyond the clock's moving events: fixed-date gifting days and regional sales. */
function extraShopping(year: number): Shopping[] {
  const christmas = Date.UTC(year, 11, 25)
  const saturdayBefore = new Date(christmas - (((new Date(christmas).getUTCDay() + 1) % 7) || 7) * 864e5).toISOString().slice(0, 10)
  const out: Shopping[] = [
    { id: "valentines-day", name: "Valentine's Day", date: `${year}-02-14`, regions: [], severity: "major" },
    { id: "fathers-day-us", name: "Father's Day (US)", date: nthWeekday(year, 5, 0, 3), regions: ["US"], severity: "major" },
    { id: "halloween", name: "Halloween", date: `${year}-10-31`, regions: ["US", "CA"], severity: "major" },
    { id: "super-saturday", name: "Super Saturday", date: saturdayBefore, regions: ["US", "GB"], severity: "major" },
  ]
  const d = diwali[year]
  if (d) out.push({ id: "diwali", name: "Diwali", date: d, regions: ["IN"], severity: "major" })
  return out
}

/** The biggest days of the retail year, ranked critical: a week holding one is never comparable to a plain week. */
const PEAK = new Set(["black-friday", "cyber-monday", "prime-day", "singles-day"])

/** The shopping calendar: the clock's moving shopping days (Black Friday, Prime Day...) plus the extras above. */
export function shoppingEvents(range: DateRange): WorldEvent[] {
  return years(range)
    .flatMap((year) => [
      ...movingEvents(year)
        .filter((e) => e.kind === "shopping")
        .map((e) => ({ id: e.id, name: e.name, date: e.date, regions: e.regions, severity: (PEAK.has(e.id) ? "critical" : "major") as Severity })),
      ...extraShopping(year),
    ])
    .filter((e) => e.date >= range.from && e.date <= range.to)
    .map((e) => ({
      id: `shopping:${e.id}:${e.date.slice(0, 4)}`,
      feed: "shopping" as const,
      date: e.date,
      end: null,
      source: "wowyoy shopping calendar",
      title: e.name,
      url: feedInfo.shopping.home,
      severity: e.severity,
      affects: feedInfo.shopping.affects,
      ...(e.regions.length ? { regions: e.regions } : {}),
    }))
}

/**
 * Clock changes for the US (second Sunday of March, first Sunday of November) and the EU and UK
 * (last Sunday of March and October). They shift hourly and daily numbers, not weekly totals, so
 * they are calendar notes: severity minor.
 */
export function dstEvents(range: DateRange): WorldEvent[] {
  return years(range)
    .flatMap((year) => [
      { id: "us-forward", title: "Clocks go forward in the US", date: nthWeekday(year, 2, 0, 2), regions: ["US"] },
      { id: "us-back", title: "Clocks go back in the US", date: nthWeekday(year, 10, 0, 1), regions: ["US"] },
      { id: "eu-forward", title: "Clocks go forward in the EU and UK", date: nthWeekday(year, 2, 0, -1), regions: ["EU", "GB"] },
      { id: "eu-back", title: "Clocks go back in the EU and UK", date: nthWeekday(year, 9, 0, -1), regions: ["EU", "GB"] },
    ])
    .filter((e) => e.date >= range.from && e.date <= range.to)
    .map((e) => ({
      id: `dst:${e.id}:${e.date.slice(0, 4)}`,
      feed: "dst" as const,
      date: e.date,
      end: null,
      source: "Clock rules",
      title: e.title,
      url: feedInfo.dst.home,
      severity: "minor" as const,
      affects: feedInfo.dst.affects,
      regions: e.regions,
    }))
}

const computed = (fn: (r: DateRange) => WorldEvent[]) => async (range: DateRange): Promise<Loaded> => ({
  events: fn(range).filter((e) => overlaps(e, range)),
})

export const loadHolidays = computed(holidayEvents)
export const loadShopping = computed(shoppingEvents)
export const loadDst = computed(dstEvents)
