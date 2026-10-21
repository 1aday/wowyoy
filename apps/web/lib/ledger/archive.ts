import { closesAt, isClosed, isoWeekOf, latestClosedWeek, parseWeekId, shiftWeek, weeksBetween, type IsoWeek } from "@workspace/metrics"

/** The archive opens with the 2025 holiday season, so the first Black Friday is on the record. */
export const ARCHIVE_START = parseWeekId("2025-w45") as IsoWeek

export type WeekState = "closed" | "open" | "future" | "before-archive"

export function weekState(week: IsoWeek, now = new Date()): WeekState {
  if (week.monday < ARCHIVE_START.monday) return "before-archive"
  if (isClosed(week, now)) return "closed"
  return week.id === isoWeekOf(now).id || week.id === shiftWeek(isoWeekOf(now), -1).id ? "open" : "future"
}

/** Closed weeks in the archive, newest first. */
export function archiveWeeks(now = new Date()): IsoWeek[] {
  return weeksBetween(ARCHIVE_START, latestClosedWeek(now))
}

/**
 * A week is settled a day after it closes: incidents that ran past Sunday are resolved by then, and
 * the status APIs still list every incident of the week (their full lists reach back about two weeks).
 * The daily feeds cron reads the latest closed week, which freezes it inside that window.
 */
export function isSettled(week: IsoWeek, now = new Date()) {
  return +now >= +closesAt(week) + 864e5
}

/** Neighbours for prev/next links: only weeks that have pages. */
export function neighbours(week: IsoWeek, now = new Date()) {
  const prev = shiftWeek(week, -1)
  const next = shiftWeek(week, 1)
  return {
    prev: weekState(prev, now) === "closed" ? prev : null,
    next: weekState(next, now) === "closed" ? next : null,
  }
}
