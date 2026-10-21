import { feedInfo } from "@workspace/feeds"
import { absolute, paths } from "@workspace/compiler"
import type { RepoLedgerRow } from "@/lib/gh/ledger"
import { closedAt, eventDates, shortDate, weekRange } from "./format"
import type { LedgerWeek } from "./week"

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ")
const where = (regions: string[]) => (regions.length ? regions.join(" ") : "Everywhere")
const signedPct = (x: number) => `${x < 0 ? "−" : "+"}${Math.abs(x * 100).toFixed(1)}%`

/** The .md twin of a week page: the same rows, as plain Markdown tables. */
export function weekMarkdown(l: LedgerWeek, repos: RepoLedgerRow[]): string {
  const { week } = l
  const out: string[] = [
    `# ${l.title}`,
    "",
    `Monday Ledger · ${week.id} · ${weekRange(week)} · closed ${closedAt(week)}`,
    "",
    `Canonical: ${absolute(paths.week(week.id))}`,
    "",
    "## Calendar",
    "",
  ]
  if (l.calendar.length) {
    out.push("| Date | Event | Where | Kind |", "| --- | --- | --- | --- |")
    for (const r of l.calendar) out.push(`| ${shortDate(r.date)} | ${cell(r.name)} | ${where(r.regions)} | ${r.moving ? "moving " : ""}${r.kind} |`)
  } else out.push("No public holidays, shopping days or clock changes in the 13 markets tracked.")
  out.push("", `Year over year: compared with ${l.yoy.base.id}.${l.yoy.note ? ` ${l.yoy.note}` : ""}`, "", "## World", "")
  if (l.world.length) {
    out.push("| Date | Source | Event | Severity | Can move |", "| --- | --- | --- | --- | --- |")
    for (const g of l.world) {
      for (const e of g.events) {
        out.push(`| ${eventDates(e)} | ${e.source} | [${cell(e.title)}](${e.url}) | ${e.severity} | ${g.affects.map((a) => a.id).join(", ")} |`)
      }
    }
  } else out.push("Nothing above minor from the feeds that answered.")
  for (const u of l.unavailable) out.push("", `Feed unavailable: ${u.name}. ${u.reason}`)
  if (repos.length) {
    out.push("", "## Repos", "", "| Repo | Measure | Value | Change | Call |", "| --- | --- | --- | --- | --- |")
    for (const r of repos) out.push(`| [${r.owner}/${r.repo}](${absolute(r.path)}) | ${r.measure} | ${r.value} | ${signedPct(r.change)} | ${r.call} |`)
  }
  out.push("", "## Sources", "")
  for (const f of l.feeds) {
    const info = feedInfo[f.feed]
    out.push(`- ${info.name}: ${info.home} (${f.status === "ok" ? `read ${f.fetchedAt.slice(0, 16).replace("T", " ")} UTC` : "unavailable"})`)
  }
  out.push("", "Written by fixed rules from public feeds; no model writes this page.", "")
  return out.join("\n")
}
