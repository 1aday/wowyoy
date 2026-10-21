import { absolute, paths } from "@workspace/compiler"
import { closesAt } from "@workspace/metrics"
import { weekRange } from "./format"
import type { LedgerWeek } from "./week"

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** RSS 2.0: one item per closed week, newest first, published when the week closed. */
export function ledgerRss(weeks: LedgerWeek[], now = new Date()): string {
  const self = absolute("/w/rss.xml")
  const items = weeks.map((l) => {
    const url = absolute(paths.week(l.week.id))
    return [
      "    <item>",
      `      <title>${esc(l.title)}</title>`,
      `      <link>${url}</link>`,
      `      <guid isPermaLink="true">${url}</guid>`,
      `      <pubDate>${closesAt(l.week).toUTCString()}</pubDate>`,
      `      <description>${esc(`${weekRange(l.week)}. ${l.headline}`)}</description>`,
      "    </item>",
    ].join("\n")
  })
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    "  <channel>",
    "    <title>Monday Ledger · wowyoy</title>",
    `    <link>${absolute(paths.ledger())}</link>`,
    "    <description>One page per closed ISO week: the calendar and the outside events that can move a weekly number, written by rule.</description>",
    "    <language>en</language>",
    `    <lastBuildDate>${(weeks[0] ? closesAt(weeks[0].week) : now).toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${self}" rel="self" type="application/rss+xml"/>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n")
}
