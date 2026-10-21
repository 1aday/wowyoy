import { feedInfo } from "../info"
import { getText, overlaps, type DateRange, type LoadContext, type Loaded } from "../source"
import type { Severity, WorldEvent } from "../types"

/**
 * iOS releases from Apple's developer releases RSS (the last few dozen releases of every OS and tool).
 * Only public iOS releases count; betas, release candidates, iPadOS (ships with iOS), Xcode and
 * TestFlight are skipped. A new major or feature release (iOS 27, 27.1) is major: it changes Safari
 * and app behaviour for most iPhones within days. Bug-fix releases (27.0.1) and updates to older
 * lines are minor.
 *
 * Google Play and Android have no machine-readable release feed (Android ships per device maker),
 * so this feed covers Apple only.
 */

export const appleReleasesUrl = "https://developer.apple.com/news/releases/rss/releases.rss"

const IOS = /^iOS (\d+)(?:\.(\d+))?(?:\.(\d+))? \(/
const tag = (item: string, name: string) =>
  new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`).exec(item)?.[1]?.trim() ?? ""
const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")

export interface AppleItem {
  title: string
  link: string
  date: string
}

export function appleItems(rss: string): AppleItem[] {
  return [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap((m) => {
    const t = Date.parse(tag(m[1]!, "pubDate"))
    if (!Number.isFinite(t)) return []
    return [{ title: unescape(tag(m[1]!, "title")), link: tag(m[1]!, "link"), date: new Date(t).toISOString().slice(0, 10) }]
  })
}

export function appleEvents(items: AppleItem[]): WorldEvent[] {
  const releases = items.flatMap((i) => {
    if (/beta|\bRC\b/i.test(i.title)) return []
    const m = IOS.exec(i.title)
    return m ? [{ ...i, major: Number(m[1]), patch: m[3] !== undefined, version: i.title.slice(4, i.title.indexOf(" (")) }] : []
  })
  const current = Math.max(0, ...releases.map((r) => r.major))
  return releases.map((r) => {
    const severity: Severity = r.major < current || r.patch ? "minor" : "major"
    return {
      id: `app-stores:${r.link.split("id=")[1] ?? r.version}`,
      feed: "app-stores" as const,
      date: r.date,
      end: null,
      source: "Apple Developer",
      title: `iOS ${r.version} released`,
      url: r.link,
      severity,
      affects: feedInfo["app-stores"].affects,
    }
  })
}

export async function loadApple(range: DateRange, ctx: LoadContext): Promise<Loaded> {
  const items = appleItems(await getText(ctx, appleReleasesUrl, feedInfo["app-stores"].revalidate))
  if (!items.length) throw new Error(`${appleReleasesUrl} has no items`)
  // The feed is the last N releases: weeks before its oldest item can't be answered.
  const since = items.reduce((min, i) => (i.date < min ? i.date : min), items[0]!.date)
  return { events: appleEvents(items).filter((e) => overlaps(e, range)), since }
}
