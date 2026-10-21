import Link from "next/link"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { paths } from "@workspace/compiler"
import { shiftWeek, type IsoWeek } from "@workspace/metrics"
import type { RepoLedgerRow } from "@/lib/gh/ledger"
import { CalendarTable, LedgerSection, RepoTable, WorldTable } from "./week-sections"
import type { LedgerWeek } from "@/lib/ledger/week"

const navLink = "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 font-mono text-[12.5px] text-muted-foreground transition-colors duration-[80ms] hover:text-foreground"

/** Previous and next closed weeks; `[` and `]` do the same (see WeekKeys). */
export function WeekNav({ prev, next, className }: { prev: IsoWeek | null; next: IsoWeek | null; className?: string }) {
  return (
    <nav aria-label="Weeks" className={className}>
      <div className="flex items-center gap-1">
        {prev ? (
          <Link href={paths.week(prev.id)} className={navLink} rel="prev" title="Previous week ( [ )">
            <ArrowLeft className="size-3.5" strokeWidth={1.5} aria-hidden />
            {prev.id}
          </Link>
        ) : (
          <span className={`${navLink} opacity-40`}>
            <ArrowLeft className="size-3.5" strokeWidth={1.5} aria-hidden />
            Start
          </span>
        )}
        {next ? (
          <Link href={paths.week(next.id)} className={navLink} rel="next" title="Next week ( ] )">
            {next.id}
            <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
          </Link>
        ) : (
          <span className={`${navLink} opacity-40`}>
            Latest
            <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
          </span>
        )}
      </div>
    </nav>
  )
}

/** The rows of one week, in their fixed order: calendar, world, repos. */
export function WeekBody({ ledger, repos }: { ledger: LedgerWeek; repos: RepoLedgerRow[] }) {
  return (
    <>
      <LedgerSection id="calendar" label="Calendar" note="Holidays, shopping days and clock changes in 13 markets.">
        <CalendarTable rows={ledger.calendar} />
        <p className="mt-5 text-[13.5px] leading-relaxed text-muted-foreground">
          <span className="label-mono mr-2">YoY base</span>
          <span className="num text-foreground">{ledger.yoy.base.id}</span>
          {ledger.yoy.event && ledger.yoy.note ? (
            <span>
              , aligned on {ledger.yoy.event.name} (not <span className="num">{shiftWeek(ledger.week, -52).id}</span>).
            </span>
          ) : (
            <span>, the same week last year.</span>
          )}
        </p>
      </LedgerSection>
      <LedgerSection id="world" label="World" note="Outside events above minor, from five public feeds.">
        <WorldTable ledger={ledger} />
      </LedgerSection>
      {repos.length > 0 && (
        <LedgerSection id="repos" label="Repos" note="Watched repos whose week moved beyond noise.">
          <RepoTable rows={repos} />
        </LedgerSection>
      )}
    </>
  )
}
