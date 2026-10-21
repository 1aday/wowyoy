import { feedInfo, severityRank, type FeedId, type FeedResult, type Severity, type WorldEvent } from "@workspace/feeds"
import { alignYoy, eventsInWeek, publishedSpecs, type IsoWeek, type YoyAlignment } from "@workspace/metrics"
import { paths } from "@workspace/compiler"
import { repoRowsForWeek, type RepoLedgerRow } from "@/lib/gh/ledger"
import { feedsForWeek, feedsForWeeks } from "./feeds"
import { humanize, longDate, weekName, weekday, wherePhrase } from "./format"

/** Outside events that can move a week's numbers, in the order the page lists them. */
export const WORLD_FEEDS = ["cloudflare", "stripe", "ad-platforms", "google-search", "app-stores"] as const satisfies readonly FeedId[]
export type WorldFeed = (typeof WORLD_FEEDS)[number]
/** The world feeds that report outages: only when all of them answered can a week claim "no major outages". */
const OUTAGE_FEEDS: readonly FeedId[] = ["cloudflare", "stripe", "ad-platforms", "google-search"]
const isOutageFeed = (f: FeedId) => OUTAGE_FEEDS.includes(f)

export type CalendarKind = "shopping" | "holiday" | "clocks"

export interface CalendarRow {
  id: string
  date: string
  name: string
  /** ISO codes; empty = everywhere. */
  regions: string[]
  kind: CalendarKind
  /** Moves between years, so year over year is aligned on it. */
  moving: boolean
  severity: Severity
}

export interface WorldGroup {
  feed: WorldFeed
  name: string
  home: string
  affects: { id: string; name: string; href: string | null }[]
  events: WorldEvent[]
  /** Minor events read but not listed. */
  minor: number
}

export interface Unavailable {
  feed: FeedId
  name: string
  home: string
  reason: string
}

export interface LedgerWeek {
  week: IsoWeek
  /** The rule-written sentence. */
  headline: string
  /** "Week 42, 2026: <headline>" */
  title: string
  calendar: CalendarRow[]
  yoy: YoyAlignment
  world: WorldGroup[]
  /** World feeds that answered with nothing above minor. */
  quiet: WorldFeed[]
  unavailable: Unavailable[]
  feeds: FeedResult[]
}

const firstWord = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").split(" ")[0] ?? ""

/** Calendar rows: the clock's moving events, then the feeds' holidays, shopping days and clock changes. */
export function calendarRows(week: IsoWeek, feeds: FeedResult[]): CalendarRow[] {
  const moving = eventsInWeek(week).map(
    (e): CalendarRow => ({
      id: `moving:${e.id}`,
      date: e.date,
      name: e.name,
      regions: e.regions,
      kind: e.kind,
      moving: true,
      severity: ["black-friday", "cyber-monday", "prime-day", "singles-day"].includes(e.id) ? "critical" : "major",
    }),
  )
  const events = (id: FeedId) => feeds.find((f) => f.feed === id)?.events ?? []
  const shopping = events("shopping")
    .filter((e) => !moving.some((m) => e.id.startsWith(`shopping:${m.id.slice(7)}:`)))
    .map((e): CalendarRow => ({ id: e.id, date: e.date, name: e.title, regions: e.regions ?? [], kind: "shopping", moving: false, severity: e.severity }))
  const holidays = events("holidays")
    .filter((e) => !moving.some((m) => m.date === e.date && firstWord(m.name) === firstWord(e.title)))
    .map((e): CalendarRow => ({ id: e.id, date: e.date, name: e.title, regions: e.regions ?? [], kind: "holiday", moving: false, severity: e.severity }))
  const clocks = events("dst").map((e): CalendarRow => ({ id: e.id, date: e.date, name: e.title, regions: e.regions ?? [], kind: "clocks", moving: false, severity: e.severity }))
  const order: Record<CalendarKind, number> = { shopping: 0, holiday: 1, clocks: 2 }
  return [...moving, ...shopping, ...holidays, ...clocks].sort(
    (a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind] || b.regions.length - a.regions.length || a.name.localeCompare(b.name),
  )
}

function standardLinks(ids: string[]) {
  const published = new Map(publishedSpecs().map((s) => [s.id, s.name]))
  return ids.map((id) => ({ id, name: published.get(id) ?? humanize(id), href: published.has(id) ? paths.metric(id) : null }))
}

function unavailableReason(r: FeedResult) {
  const since = /history starts (\d{4}-\d{2}-\d{2})/.exec(r.error ?? "")?.[1]
  return since ? `Its public history starts ${longDate(since)}, after this week.` : "The source didn't answer, so this page can't say either way."
}

/* Headline ---------------------------------------------------------------------------- */

const subjects: Record<WorldFeed, (e: WorldEvent) => string> = {
  cloudflare: () => "Cloudflare",
  stripe: () => "Stripe",
  "ad-platforms": (e) => (e.source.startsWith("Meta") ? "Meta ads" : "Google Ads"),
  "google-search": (e) => (/update$/i.test(e.title) ? `ranking:${e.id}` : "Google Search"),
  "app-stores": (e) => `release:${e.id}`,
}

const worse = (a: WorldEvent, b: WorldEvent) => severityRank[b.severity] - severityRank[a.severity] || a.date.localeCompare(b.date)

function worldClause(week: IsoWeek, subject: string, events: WorldEvent[]): string {
  const top = [...events].sort(worse)[0]!
  if (subject.startsWith("ranking:")) {
    const name = `Google's ${top.title}`
    if (top.date >= week.monday) return `${name} began on ${weekday(top.date)}`
    if (top.end && top.end <= week.sunday) return `${name} finished on ${weekday(top.end)}`
    return `${name} was rolling out`
  }
  if (subject.startsWith("release:")) return `Apple released ${top.title.replace(/ released$/, "")} on ${weekday(top.date)}`
  const noun = top.feed === "ad-platforms" ? "disruption" : "incident"
  if (events.length === 1) return `${subject} had a ${top.severity} ${noun} on ${weekday(top.date)}`
  const critical = events.filter((e) => e.severity === "critical").length
  if (critical === events.length) return `${subject} had ${events.length} critical ${noun}s`
  return `${subject} had ${events.length} major ${noun}s${critical ? `, ${critical === 1 ? "one" : critical} of them critical` : ""}`
}

/** The calendar items worth a headline: peak shopping days, moving holidays, other shopping days, holidays in 4+ markets. */
function calendarClauses(rows: CalendarRow[]): { items: string[]; peak: boolean } {
  const tier = (r: CalendarRow) =>
    r.kind === "shopping" && r.severity === "critical" ? 0 : r.moving ? 1 : r.kind === "shopping" ? 2 : r.kind === "holiday" && r.regions.length >= 4 ? 3 : 9
  const picked = rows
    .filter((r) => tier(r) < 9)
    .sort((a, b) => tier(a) - tier(b) || a.date.localeCompare(b.date))
    .slice(0, 2)
  // "Father's Day (US)" reads "Father's Day in the US": the place is said once.
  const items = picked.map((r) => `${r.regions.length ? r.name.replace(/ \([A-Z]{2}\)$/, "") : r.name}${wherePhrase(r.regions)}`)
  return { items, peak: picked.some((r) => tier(r) === 0) }
}

const shortNames: Record<WorldFeed, string> = {
  cloudflare: "Cloudflare",
  stripe: "Stripe",
  "ad-platforms": "the ad platforms",
  "google-search": "Google Search",
  "app-stores": "Apple",
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`)

/**
 * The week in one sentence, by fixed rules: the worst outside event per source (two at most)
 * and up to two calendar items, with Black Friday-class days first. A quiet week says so, and only claims "no major outages" when
 * every outage feed answered.
 */
export function headlineFor(week: IsoWeek, world: WorldGroup[], calendar: CalendarRow[], unavailable: Unavailable[]): string {
  const bySubject = new Map<string, WorldEvent[]>()
  for (const g of world) for (const e of g.events) bySubject.set(subjects[g.feed](e), [...(bySubject.get(subjects[g.feed](e)) ?? []), e])
  const rank = (evs: WorldEvent[]) => [...evs].sort(worse)[0]!
  const worldParts = [...bySubject.entries()]
    .sort(([, a], [, b]) => worse(rank(a), rank(b)) || WORLD_FEEDS.indexOf(rank(a).feed as WorldFeed) - WORLD_FEEDS.indexOf(rank(b).feed as WorldFeed))
    .slice(0, 2)
    .map(([subject, evs]) => worldClause(week, subject, evs))
  const outagesAnswered = !unavailable.some((u) => isOutageFeed(u.feed))
  // Peak shopping days lead the sentence; other calendar items follow the outside events.
  const { items: cal, peak } = calendarClauses(calendar)
  const parts: string[] = peak ? [list(cal), ...worldParts] : [...worldParts]
  if (cal.length && !peak) parts.push(list(cal))
  if (!worldParts.length && outagesAnswered) parts.push(cal.length ? "no major outages" : "A quiet week: no major outages, no moving holidays")
  // A missing feed only reaches the headline when there is nothing else to say; the line under it counts the feeds.
  if (!worldParts.length && !outagesAnswered && !cal.length) {
    const names = WORLD_FEEDS.filter((f) => isOutageFeed(f) && unavailable.some((u) => u.feed === f)).map((f) => shortNames[f])
    parts.push(`No moving holidays; ${list(names)} ${names.length === 1 ? "was" : "were"} unavailable`)
  }
  return `${capital(parts.join("; "))}.`
}

/* Assembly ---------------------------------------------------------------------------- */

export function buildWeek(week: IsoWeek, feeds: FeedResult[]): LedgerWeek {
  const world: WorldGroup[] = []
  const quiet: WorldFeed[] = []
  for (const feed of WORLD_FEEDS) {
    const r = feeds.find((f) => f.feed === feed)
    if (!r || r.status !== "ok") continue
    const above = r.events.filter((e) => e.severity !== "minor")
    if (!above.length) {
      quiet.push(feed)
      continue
    }
    world.push({
      feed,
      name: feedInfo[feed].name,
      home: feedInfo[feed].home,
      affects: standardLinks(feedInfo[feed].affects),
      events: above,
      minor: r.events.length - above.length,
    })
  }
  const unavailable = feeds
    .filter((r) => r.status === "unavailable")
    .map((r) => ({ feed: r.feed, name: feedInfo[r.feed].name, home: feedInfo[r.feed].home, reason: unavailableReason(r) }))
  const calendar = calendarRows(week, feeds)
  const headline = headlineFor(week, world, calendar, unavailable)
  return { week, headline, title: `${weekName(week)}: ${headline}`, calendar, yoy: alignYoy(week), world, quiet, unavailable, feeds }
}

export async function ledgerWeek(week: IsoWeek): Promise<LedgerWeek> {
  return buildWeek(week, await feedsForWeek(week))
}

export async function ledgerWeeks(weeks: readonly IsoWeek[]): Promise<LedgerWeek[]> {
  const feeds = await feedsForWeeks(weeks)
  return weeks.map((w, i) => buildWeek(w, feeds[i] ?? []))
}

/** Repo rows never break a week page: no rows is the same as an empty section. */
export async function repoRows(week: IsoWeek): Promise<RepoLedgerRow[]> {
  try {
    return await repoRowsForWeek(week)
  } catch {
    return []
  }
}
