"use client"

import * as React from "react"
import { ArrowRight } from "lucide-react"
import { delta, formatValue, formatWeek, formatWeekRange, metricById, yearInMondays, type MetricId, type MetricWeek } from "@workspace/metrics"
import { Button } from "@workspace/ui/components/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { Delta } from "@workspace/ui/brand/delta"
import { Prompt } from "@workspace/ui/brand/prompt"
import { Verdict } from "@workspace/ui/brand/verdict"
import { cn } from "@workspace/ui/lib/utils"
import { isoWeekNumber, WeekStepper } from "./pulse-view"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * A Year in Mondays: the last 52 weekly headlines, backfilled from history on connect.
 * Each square is one Monday's read: green or red when something moved beyond noise, grey when nothing did.
 */
export function YearView({
  rows,
  index,
  lead,
  onWeek,
  onOpen,
}: {
  rows: MetricWeek[]
  index: number
  lead: MetricId
  onWeek: (i: number) => void
  onOpen: (i: number) => void
}) {
  const last = rows.length - 1
  const year = React.useMemo(() => yearInMondays(rows, last, 52), [rows, last])
  const cur = year.find((y) => y.index === index) ?? year.at(-1)!
  const moved = year.filter((y) => y.verdict.state !== "flat").length
  const def = metricById[lead]
  const ledger = React.useMemo(() => [...year].reverse(), [year])

  return (
    <section className="pt-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Prompt command="year_in_mondays" flags={`--weeks ${year.length}`} />
        <WeekStepper rows={rows} index={cur.index} onStep={(d) => onWeek(cur.index + d)} />
      </div>
      <Verdict verdict={cur.verdict} size={46} className="max-w-4xl max-sm:pixel-33" />
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[12.5px] text-muted-foreground">
        <span>
          W{isoWeekNumber(cur.week)} · {formatWeekRange(cur.week)}
        </span>
        {rows[cur.index]!.values[lead] != null && (
          <span>
            · {def.short} <span className="text-foreground">{formatValue(def, rows[cur.index]!.values[lead]!)}</span>
          </span>
        )}
        <Button variant="ghost" size="sm" className="-ml-1 font-sans text-[13px]" onClick={() => onOpen(cur.index)}>
          Open this week in the Pulse <ArrowRight className="size-3.5" strokeWidth={1.5} />
        </Button>
      </div>

      <div className="mt-8 rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="label-mono">
            Your last {year.length} Mondays · {moved} with a move beyond noise
          </span>
          <div className="flex flex-wrap gap-4 font-mono text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2.5 rounded-[2px] bg-up" />
              Up beyond noise
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2.5 rounded-[2px] bg-down" />
              Down beyond noise
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2.5 rounded-[2px] bg-band" />
              Within noise
            </span>
          </div>
        </div>
        <div className="overflow-x-auto pb-1">
          <div className="min-w-[620px]">
            <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${year.length}, minmax(0, 1fr))` }} role="group" aria-label="Mondays">
              {year.map((y) => (
                <Tooltip key={y.week}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onWeek(y.index)}
                      aria-pressed={y.index === cur.index}
                      aria-label={`Week of ${formatWeek(y.week)}: ${y.verdict.text}`}
                      className={cn(
                        "h-9 rounded-[3px] transition-transform duration-[80ms] hover:-translate-y-0.5",
                        y.verdict.state === "up" ? "bg-up" : y.verdict.state === "down" ? "bg-down" : "bg-band",
                        y.index === cur.index && "relative z-10 ring-2 ring-foreground ring-offset-2 ring-offset-card hover:translate-y-0",
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px]">
                    <div className="font-mono text-[11px] opacity-70">Week of {formatWeek(y.week)}</div>
                    <div className="mt-0.5 text-[12.5px] leading-snug">{y.verdict.text}</div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            <div className="mt-2 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${year.length}, minmax(0, 1fr))` }} aria-hidden>
              {year.map((y, k) => {
                const m = new Date(`${y.week}T00:00:00Z`).getUTCMonth()
                const prev = k ? new Date(`${year[k - 1]!.week}T00:00:00Z`).getUTCMonth() : -1
                return (
                  <span key={y.week} className="overflow-visible font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                    {m !== prev ? MONTHS[m] : ""}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <div className="label-mono mb-2 border-b border-border pb-2">Every Monday, newest first</div>
        <ol>
          {ledger.map((y) => {
            const d = delta(rows, lead, y.index, "wow")
            const value = rows[y.index]!.values[lead]
            return (
              <li key={y.week}>
                <button
                  type="button"
                  onClick={() => onWeek(y.index)}
                  aria-current={y.index === cur.index ? "true" : undefined}
                  className={cn(
                    "grid w-full grid-cols-[88px_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1 border-b border-border px-2 py-3 text-left transition-colors duration-[80ms] hover:bg-accent sm:grid-cols-[96px_minmax(0,1fr)_96px_80px]",
                    y.index === cur.index && "bg-accent",
                  )}
                >
                  <span className="font-mono text-[12.5px] text-muted-foreground">
                    {formatWeek(y.week)} <span className="opacity-60">W{isoWeekNumber(y.week)}</span>
                  </span>
                  <span className="text-[14px] text-pretty">
                    {y.verdict.parts.map((p, k) => (
                      <span key={k} className={cn(p.tone === "up" && "text-up", p.tone === "down" && "text-down")}>
                        {p.text}
                      </span>
                    ))}
                  </span>
                  <span className="num text-right text-[13px] max-sm:col-start-2 max-sm:text-left">
                    {value != null ? formatValue(def, value) : "—"}
                  </span>
                  <span className="text-right max-sm:hidden">
                    <Delta delta={d} kind={def.kind} />
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
