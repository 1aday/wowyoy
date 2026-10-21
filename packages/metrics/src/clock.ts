/**
 * The weekly clock. Weeks are ISO weeks in UTC (Monday to Sunday). A week closes on the
 * following Monday at 06:00 UTC and never changes afterwards; every week-bound page is
 * written from closed weeks only.
 *
 * Year over year is aligned on moving events, not week numbers: Black Friday week compares
 * with last year's Black Friday week even when the ISO week number differs.
 */

const DAY = 864e5
const WEEK = 7 * DAY
/** Hours after Monday 00:00 UTC that the previous week closes. */
export const CLOSE_HOUR_UTC = 6

export interface IsoWeek {
  year: number
  week: number
  /** "2026-w43", the URL form. */
  id: string
  /** Monday, YYYY-MM-DD. */
  monday: string
  /** Sunday, YYYY-MM-DD. */
  sunday: string
}

const ymd = (t: number) => new Date(t).toISOString().slice(0, 10)

function mondayOf(t: number) {
  const d = new Date(t)
  const day = (d.getUTCDay() + 6) % 7
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)
}

/** The ISO week containing a date (any time on that UTC day). */
export function isoWeekOf(date: Date | string | number): IsoWeek {
  const t = typeof date === "string" ? Date.parse(date.length === 10 ? `${date}T00:00:00Z` : date) : +date
  const monday = mondayOf(t)
  // The ISO year is the year of the week's Thursday.
  const thursday = new Date(monday + 3 * DAY)
  const year = thursday.getUTCFullYear()
  const jan4 = Date.UTC(year, 0, 4)
  const week = 1 + Math.round((monday - mondayOf(jan4)) / WEEK)
  return { year, week, id: `${year}-w${String(week).padStart(2, "0")}`, monday: ymd(monday), sunday: ymd(monday + 6 * DAY) }
}

/** Parse "2026-w43" (any case). Returns null for weeks that don't exist (w53 in a 52-week year). */
export function parseWeekId(id: string): IsoWeek | null {
  const m = /^(\d{4})-w(\d{2})$/i.exec(id.trim())
  if (!m) return null
  const year = Number(m[1])
  const week = Number(m[2])
  if (week < 1 || week > 53) return null
  const monday = mondayOf(Date.UTC(year, 0, 4)) + (week - 1) * WEEK
  const w = isoWeekOf(monday)
  return w.year === year && w.week === week ? w : null
}

/** When a week closes: the next Monday at 06:00 UTC. */
export function closesAt(week: IsoWeek) {
  return new Date(Date.parse(`${week.monday}T00:00:00Z`) + WEEK + CLOSE_HOUR_UTC * 3600e3)
}

export function isClosed(week: IsoWeek, now = new Date()) {
  return +now >= +closesAt(week)
}

/** The most recent closed week at `now`. */
export function latestClosedWeek(now = new Date()): IsoWeek {
  return isoWeekOf(+now - CLOSE_HOUR_UTC * 3600e3 - WEEK)
}

export function shiftWeek(week: IsoWeek, by: number): IsoWeek {
  return isoWeekOf(Date.parse(`${week.monday}T00:00:00Z`) + by * WEEK)
}

/** Closed weeks, newest first, from `latest` back to `since` (inclusive). */
export function weeksBetween(since: IsoWeek, latest: IsoWeek): IsoWeek[] {
  const out: IsoWeek[] = []
  for (let w = latest; w.monday >= since.monday; w = shiftWeek(w, -1)) out.push(w)
  return out
}

/* Moving events used to align year over year ----------------------------------------- */

export interface CalendarEvent {
  id: string
  name: string
  /** YYYY-MM-DD */
  date: string
  kind: "holiday" | "shopping"
  /** Where it matters, as ISO country codes; empty = global. */
  regions: string[]
}

/** Easter Sunday (Gregorian), anonymous Gregorian algorithm. */
export function easter(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return ymd(Date.UTC(year, month - 1, day))
}

/** The nth weekday (0 = Sunday) of a month; n = -1 for the last. */
function nthWeekday(year: number, month: number, weekday: number, n: number) {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay()
    return ymd(Date.UTC(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7))
  }
  const lastDate = new Date(Date.UTC(year, month + 1, 0))
  const back = (lastDate.getUTCDay() - weekday + 7) % 7
  return ymd(Date.UTC(year, month, lastDate.getUTCDate() - back))
}

const addDays = (date: string, days: number) => ymd(Date.parse(`${date}T00:00:00Z`) + days * DAY)

/** Amazon Prime Day's first day, as announced; later years fall back to the second Tuesday of July. */
const primeDay: Record<number, string> = { 2023: "2023-07-11", 2024: "2024-07-16", 2025: "2025-07-08" }

/** Lunar New Year (first day), which moves between late January and mid February. */
const lunarNewYear: Record<number, string> = {
  2023: "2023-01-22",
  2024: "2024-02-10",
  2025: "2025-01-29",
  2026: "2026-02-17",
  2027: "2027-02-06",
  2028: "2028-01-26",
  2029: "2029-02-13",
  2030: "2030-02-03",
}

/** The events that move between years and so break week-number year-over-year comparisons. */
export function movingEvents(year: number): CalendarEvent[] {
  const thanksgiving = nthWeekday(year, 10, 4, 4)
  const ev: CalendarEvent[] = [
    { id: "easter", name: "Easter", date: easter(year), kind: "holiday", regions: [] },
    { id: "mothers-day-us", name: "Mother's Day (US)", date: nthWeekday(year, 4, 0, 2), kind: "shopping", regions: ["US"] },
    { id: "mothers-day-uk", name: "Mothering Sunday (UK)", date: addDays(easter(year), -21), kind: "shopping", regions: ["GB"] },
    { id: "memorial-day", name: "Memorial Day", date: nthWeekday(year, 4, 1, -1), kind: "holiday", regions: ["US"] },
    { id: "prime-day", name: "Prime Day", date: primeDay[year] ?? nthWeekday(year, 6, 2, 2), kind: "shopping", regions: [] },
    { id: "labor-day", name: "Labor Day", date: nthWeekday(year, 8, 1, 1), kind: "holiday", regions: ["US"] },
    { id: "singles-day", name: "Singles' Day", date: `${year}-11-11`, kind: "shopping", regions: ["CN"] },
    { id: "thanksgiving", name: "Thanksgiving", date: thanksgiving, kind: "holiday", regions: ["US"] },
    { id: "black-friday", name: "Black Friday", date: addDays(thanksgiving, 1), kind: "shopping", regions: [] },
    { id: "cyber-monday", name: "Cyber Monday", date: addDays(thanksgiving, 4), kind: "shopping", regions: [] },
    { id: "christmas", name: "Christmas Day", date: `${year}-12-25`, kind: "holiday", regions: [] },
    { id: "new-year", name: "New Year's Day", date: `${year}-01-01`, kind: "holiday", regions: [] },
  ]
  const lny = lunarNewYear[year]
  if (lny) ev.push({ id: "lunar-new-year", name: "Lunar New Year", date: lny, kind: "holiday", regions: ["CN", "KR", "VN", "SG"] })
  return ev.sort((a, b) => a.date.localeCompare(b.date))
}

/** Moving events that fall inside a week. */
export function eventsInWeek(week: IsoWeek): CalendarEvent[] {
  const years = new Set([Number(week.monday.slice(0, 4)), Number(week.sunday.slice(0, 4))])
  return [...years].flatMap(movingEvents).filter((e) => e.date >= week.monday && e.date <= week.sunday)
}

export interface YoyAlignment {
  /** The week last year to compare with. */
  base: IsoWeek
  /** The event that set the alignment, when one did. */
  event: CalendarEvent | null
  /** Plain sentence for the page, e.g. "Aligned on Black Friday: compared with 2025-w48, not 2025-w47." */
  note: string | null
}

/**
 * The comparison week for year over year. When the week holds a moving event, compare with
 * the week holding the same event last year; otherwise the same position 52 weeks back.
 */
export function alignYoy(week: IsoWeek): YoyAlignment {
  const plain = shiftWeek(week, -52)
  // Shopping events lead: Black Friday matters more to a weekly number than Thanksgiving itself.
  const events = eventsInWeek(week).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "shopping" ? -1 : 1))
  for (const e of events) {
    const prior = movingEvents(Number(e.date.slice(0, 4)) - 1).find((p) => p.id === e.id)
    if (!prior) continue
    const base = isoWeekOf(prior.date)
    if (base.id === plain.id) return { base, event: e, note: null }
    return { base, event: e, note: `Aligned on ${e.name}: compared with ${base.id}, not ${plain.id}.` }
  }
  return { base: plain, event: null, note: null }
}
