import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { feedInfo, type FeedResult } from "@workspace/feeds"
import { DOWN, UP } from "@workspace/metrics"
import { cn } from "@workspace/ui/lib/utils"
import type { RepoLedgerRow } from "@/lib/gh/ledger"
import { countryName, eventDates, monthDay, shortDate } from "@/lib/ledger/format"
import type { CalendarRow, LedgerWeek, WorldGroup } from "@/lib/ledger/week"

/** One ledger section: the label sits in a left rail on wide screens, above the table on narrow ones. */
export function LedgerSection({ label, note, children, id }: { label: string; note?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-label` : undefined} className="grid gap-x-10 gap-y-3 border-t border-border py-8 lg:grid-cols-[11rem_minmax(0,1fr)]">
      <div>
        <h2 id={id ? `${id}-label` : undefined} className="label-mono text-foreground">
          {label}
        </h2>
        {note && <p className="mt-2 text-[13px] leading-snug text-muted-foreground">{note}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

const th = "label-mono pb-2 text-left font-medium"
const rowLine = "border-b border-border/70 last:border-0"

const kindLabel: Record<CalendarRow["kind"], string> = { shopping: "Shopping", holiday: "Holiday", clocks: "Clocks" }

function Regions({ regions }: { regions: string[] }) {
  if (!regions.length) return <span className="text-muted-foreground">Everywhere</span>
  return <span title={regions.map(countryName).join(", ")}>{regions.join(" ")}</span>
}

export function CalendarTable({ rows }: { rows: CalendarRow[] }) {
  if (!rows.length) return <p className="text-[15px] text-muted-foreground">No public holidays, shopping days or clock changes in the 13 markets tracked.</p>
  return (
    <table className="w-full text-[15px]">
      <thead className="max-sm:sr-only">
        <tr className="border-b border-border">
          <th className={cn(th, "w-36")}>Date</th>
          <th className={th}>Event</th>
          <th className={cn(th, "w-48")}>Where</th>
          <th className={cn(th, "w-24 text-right")}>Kind</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={cn(rowLine, "max-sm:grid max-sm:grid-cols-[5.5rem_minmax(0,1fr)] max-sm:gap-x-3 max-sm:py-3")}>
            <td className="num py-3 align-top text-[13px] whitespace-nowrap text-muted-foreground max-sm:py-0 max-sm:pt-[3px]">{shortDate(r.date)}</td>
            <td className="py-3 pr-4 align-top max-sm:p-0">
              <span>{r.name}</span>
              {r.moving && " "}
              {r.moving && <span className="ml-1 font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase">moves yearly</span>}
              <div className="num mt-1 text-[12px] text-muted-foreground sm:hidden">
                <Regions regions={r.regions} /> · {kindLabel[r.kind]}
              </div>
            </td>
            <td className="num py-3 pr-4 align-top text-[12.5px] max-sm:hidden">
              <Regions regions={r.regions} />
            </td>
            <td className="py-3 text-right align-top font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase max-sm:hidden">{kindLabel[r.kind]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "")

function CanMove({ affects }: { affects: WorldGroup["affects"] }) {
  return (
    <span className="text-[12.5px] leading-relaxed text-muted-foreground">
      Can move{" "}
      {affects.map((a, i) => (
        <span key={a.id}>
          {i > 0 && <span aria-hidden> · </span>}
          {a.href ? (
            <Link href={a.href} className="text-foreground underline decoration-border underline-offset-[3px] hover:decoration-foreground">
              {a.name}
            </Link>
          ) : (
            <span>{a.name}</span>
          )}
        </span>
      ))}
    </span>
  )
}

export function WorldTable({ ledger }: { ledger: LedgerWeek }) {
  const { world, unavailable, quiet } = ledger
  const minor = world.filter((g) => g.minor > 0)
  return (
    <div>
      {world.length > 0 ? (
        <table className="w-full text-[15px]">
          <thead className="sr-only">
            <tr>
              <th>Date</th>
              <th>Event</th>
              <th>Severity</th>
            </tr>
          </thead>
          {world.map((g) => (
            <tbody key={g.feed}>
              <tr>
                <th colSpan={3} scope="colgroup" className="pt-1 pb-2 text-left font-normal [tbody+tbody_&]:pt-7">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border pb-2">
                    <span className="label-mono text-foreground">{g.name}</span>
                    <CanMove affects={g.affects} />
                  </div>
                </th>
              </tr>
              {g.events.map((e) => (
                <tr key={e.id} className={cn(rowLine, "max-sm:grid max-sm:grid-cols-[5.5rem_minmax(0,1fr)] max-sm:gap-x-3 max-sm:py-3")}>
                  <td className="num w-36 py-3 align-top text-[13px] whitespace-nowrap text-muted-foreground max-sm:w-auto max-sm:py-0 max-sm:pt-[3px] max-sm:whitespace-normal">
                    {eventDates(e)}
                  </td>
                  <td className="py-3 pr-4 align-top max-sm:p-0">
                    <a href={e.url} className="group inline decoration-border underline-offset-[3px] hover:underline" rel="noopener">
                      {e.title}
                      <ArrowUpRight className="ml-1 inline size-3.5 align-[-1px] text-muted-foreground group-hover:text-foreground" strokeWidth={1.5} aria-hidden />
                    </a>
                    <div className="num mt-1 text-[12px] text-muted-foreground">
                      {host(e.url)}
                      <span className="sm:hidden"> · {e.severity}</span>
                    </div>
                  </td>
                  <td
                    className={cn(
                      "w-24 py-3 text-right align-top font-mono text-[11px] tracking-[0.06em] uppercase max-sm:hidden",
                      e.severity === "critical" ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {e.severity}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      ) : (
        unavailable.every((u) => !isWorldFeed(u.feed)) && <p className="text-[15px]">Nothing above minor from the five outside feeds.</p>
      )}

      {unavailable.length > 0 && (
        <ul className={cn("divide-y divide-border/70", world.length > 0 && "mt-6")}>
          {unavailable.map((u) => (
            <li key={u.feed} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 first:pt-0">
              <span>
                <span className="label-mono text-foreground">{u.name}</span>
                <span className="ml-3 font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase">Feed unavailable</span>
              </span>
              <span className="text-[13.5px] text-muted-foreground">{u.reason}</span>
            </li>
          ))}
        </ul>
      )}

      {(quiet.length > 0 || minor.length > 0) && (
        <p className="mt-6 text-[13.5px] leading-relaxed text-muted-foreground">
          {quiet.length > 0 && <>Nothing above minor from {joinNames(quiet.map((f) => feedInfo[f].name))}. </>}
          {minor.length > 0 && <>Not listed: {joinNames(minor.map((g) => `${g.minor} minor ${minorNoun[g.feed]}${g.minor === 1 ? "" : "s"}`))}.</>}
        </p>
      )}
    </div>
  )
}

const minorNoun: Record<WorldGroup["feed"], string> = {
  cloudflare: "Cloudflare incident",
  stripe: "Stripe incident",
  "ad-platforms": "ad platform disruption",
  "google-search": "Google Search incident",
  "app-stores": "iOS bug-fix release",
}

const isWorldFeed = (f: string) => ["cloudflare", "stripe", "ad-platforms", "google-search", "app-stores"].includes(f)
const joinNames = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`)

function RepoChange({ row }: { row: RepoLedgerRow }) {
  const dir = row.change > 0 ? "up" : row.change < 0 ? "down" : "flat"
  const real = row.call === "real" && dir !== "flat"
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-[0.35em] rounded-full px-2 py-[3px] text-[13px] leading-none whitespace-nowrap",
        dir === "up" && "text-up",
        dir === "down" && "text-down",
        dir === "flat" && "text-muted-foreground",
        real && "font-semibold",
        real && dir === "up" && "bg-up-bg",
        real && dir === "down" && "bg-down-bg",
      )}
    >
      <span className="text-[0.72em]" aria-hidden>
        {dir === "up" ? UP : dir === "down" ? DOWN : "●"}
      </span>
      {Math.abs(row.change * 100).toFixed(1)}%
    </span>
  )
}

const callLabel: Record<RepoLedgerRow["call"], string> = { real: "Real", edge: "Edge", noise: "Noise", "too-few": "Too few" }

export function RepoTable({ rows }: { rows: RepoLedgerRow[] }) {
  return (
    <table className="w-full text-[15px]">
      <thead>
        <tr className="border-b border-border">
          <th className={th}>Repo</th>
          <th className={cn(th, "max-sm:hidden")}>Measure</th>
          <th className={cn(th, "text-right")}>Week</th>
          <th className={cn(th, "text-right")}>Change</th>
          <th className={cn(th, "text-right max-sm:hidden")}>Call</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.owner}/${r.repo}/${r.measure}`} className={rowLine}>
            <td className="py-3 pr-4">
              <Link href={r.path} className="underline decoration-border underline-offset-[3px] hover:decoration-foreground">
                {r.owner}/{r.repo}
              </Link>
              <div className="text-[12px] text-muted-foreground sm:hidden">{r.measure}</div>
            </td>
            <td className="py-3 pr-4 text-muted-foreground max-sm:hidden">{r.measure}</td>
            <td className="num py-3 text-right">{r.value.toLocaleString("en-US")}</td>
            <td className="py-3 text-right">
              <RepoChange row={r} />
            </td>
            <td className="py-3 text-right font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase max-sm:hidden">{callLabel[r.call]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const COMPUTED = new Set(["holidays", "shopping", "dst"])

/** Where every row came from, and when it was read. */
export function SourcesList({ feeds }: { feeds: FeedResult[] }) {
  return (
    <ul className="grid gap-x-10 gap-y-2 text-[13.5px] sm:grid-cols-2">
      {feeds.map((f) => (
        <li key={f.feed} className="flex items-baseline justify-between gap-4 border-b border-border/70 pb-2">
          <a href={feedInfo[f.feed].home} className="text-foreground underline decoration-border underline-offset-[3px] hover:decoration-foreground" rel="noopener">
            {feedInfo[f.feed].name}
          </a>
          <span className="num text-[12px] text-muted-foreground">{f.status !== "ok" ? "unavailable" : COMPUTED.has(f.feed) ? "computed" : `read ${monthDay(f.fetchedAt.slice(0, 10))}`}</span>
        </li>
      ))}
    </ul>
  )
}
