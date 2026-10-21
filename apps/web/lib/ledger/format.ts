import { closesAt, type IsoWeek } from "@workspace/metrics"

const at = (date: string) => new Date(`${date}T00:00:00Z`)
const fmt = (date: string, o: Intl.DateTimeFormatOptions) => at(date).toLocaleDateString("en-US", { ...o, timeZone: "UTC" })

/** "Friday" */
export const weekday = (date: string) => fmt(date, { weekday: "long" })
/** "Fri Oct 2" */
export const shortDate = (date: string) => fmt(date, { weekday: "short", month: "short", day: "numeric" }).replace(",", "")
/** "Oct 2" */
export const monthDay = (date: string) => fmt(date, { month: "short", day: "numeric" })
/** "May 11, 2026" */
export const longDate = (date: string) => fmt(date, { month: "short", day: "numeric", year: "numeric" })

/** "Oct 12 – 18, 2026", "Sep 28 – Oct 4, 2026", "Dec 29, 2025 – Jan 4, 2026" */
export function weekRange(week: IsoWeek) {
  const [a, b] = [week.monday, week.sunday]
  if (a.slice(0, 4) !== b.slice(0, 4)) return `${longDate(a)} – ${longDate(b)}`
  if (a.slice(5, 7) !== b.slice(5, 7)) return `${monthDay(a)} – ${monthDay(b)}, ${b.slice(0, 4)}`
  return `${monthDay(a)} – ${Number(b.slice(8, 10))}, ${b.slice(0, 4)}`
}

/** An event's dates: "Fri Oct 2", or "Sep 24 – Oct 8" when it spans days. */
export function eventDates(e: { date: string; end?: string | null }) {
  return e.end && e.end !== e.date ? `${monthDay(e.date)} – ${monthDay(e.end)}` : shortDate(e.date)
}

/** "Mon Oct 19, 06:00 UTC" */
export const closedAt = (week: IsoWeek) => `${shortDate(closesAt(week).toISOString().slice(0, 10))}, 06:00 UTC`

/** "Week 42, 2026" */
export const weekName = (week: IsoWeek) => `Week ${week.week}, ${week.year}`

const countries: Record<string, string> = {
  US: "the US",
  GB: "the UK",
  CA: "Canada",
  AU: "Australia",
  DE: "Germany",
  FR: "France",
  NL: "the Netherlands",
  ES: "Spain",
  IT: "Italy",
  JP: "Japan",
  IN: "India",
  BR: "Brazil",
  MX: "Mexico",
  CN: "China",
  KR: "South Korea",
  VN: "Vietnam",
  SG: "Singapore",
  EU: "the EU",
}
export const countryName = (code: string) => countries[code] ?? code

/** Where a calendar event applies, as a phrase: "in India", "in 7 countries", "" for everywhere. */
export function wherePhrase(regions: readonly string[]) {
  if (!regions.length) return ""
  if (regions.length === 1) return ` in ${countryName(regions[0]!)}`
  if (regions.length === 2) return ` in ${countryName(regions[0]!)} and ${countryName(regions[1]!)}`
  return ` in ${regions.length} countries`
}

/** "payment-success-rate" → "Payment success rate", for metrics without a published page yet. */
export const humanize = (id: string) => {
  const words = id.split("-").map((w) => (["mrr", "aov", "cac", "ncac", "roas", "mer", "cpm", "cpc", "ctr", "dau", "wau", "mau", "arpa", "ltv"].includes(w) ? w.toUpperCase() : w))
  const s = words.join(" ")
  return s.charAt(0).toUpperCase() + s.slice(1)
}
