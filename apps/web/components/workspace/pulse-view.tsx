"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { formatWeekRange, metricById, pulse, verdict, type MetricId, type MetricWeek } from "@workspace/metrics"
import { Button } from "@workspace/ui/components/button"
import { Kbd } from "@workspace/ui/components/kbd"
import { Delta } from "@workspace/ui/brand/delta"
import { MetricValue } from "@workspace/ui/brand/metric-value"
import { Prompt } from "@workspace/ui/brand/prompt"
import { PulseTable } from "@workspace/ui/brand/pulse-table"
import { Verdict } from "@workspace/ui/brand/verdict"
import { BridgeChart, TrendChart, bridgeSteps, hasBridge } from "@workspace/ui/brand/chart-kit"

export function isoWeekNumber(week: string) {
  const d = new Date(`${week}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3)
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7)
}

export function WeekStepper({ rows, index, onStep }: { rows: MetricWeek[]; index: number; onStep: (d: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" aria-label="Previous week" onClick={() => onStep(-1)} disabled={index <= 1}>
        <ChevronLeft className="size-4" strokeWidth={1.5} />
      </Button>
      <span className="num min-w-[156px] text-center text-[13px]" data-testid="week-range">
        {formatWeekRange(rows[index]!.week)}
      </span>
      <Button variant="ghost" size="icon" aria-label="Next week" onClick={() => onStep(1)} disabled={index >= rows.length - 1}>
        <ChevronRight className="size-4" strokeWidth={1.5} />
      </Button>
    </div>
  )
}

export function PulseView({
  rows,
  index,
  ids,
  metric,
  onMetric,
  onStep,
}: {
  rows: MetricWeek[]
  index: number
  ids: MetricId[]
  metric: MetricId
  onMetric: (id: MetricId) => void
  onStep: (d: number) => void
}) {
  const v = React.useMemo(() => verdict(rows, index), [rows, index])
  const pulseRows = React.useMemo(() => pulse(rows, index, ids), [rows, index, ids])
  const selected = pulseRows.find((r) => r.id === metric) ?? pulseRows[0]
  const def = selected ? metricById[selected.id] : null
  const outside = pulseRows.filter((r) => r.deltas.wow?.significant).length
  const bridge = hasBridge(rows, index)
  const biggest = React.useMemo(() => {
    if (!bridge) return null
    return bridgeSteps(rows, index)
      .slice(1, -1)
      .reduce((a, b) => (Math.abs(b.change) > Math.abs(a.change) ? b : a))
  }, [rows, index, bridge])
  const week = rows[index]!.week

  return (
    <section className="pt-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Prompt command="weekly_read" flags={`--week ${week} --compare wow,4wk,qtr,yoy`} className="min-w-0 truncate" />
        <WeekStepper rows={rows} index={index} onStep={onStep} />
      </div>
      <Verdict verdict={v} size={46} className="max-w-4xl max-sm:pixel-33" />
      <p className="mt-4 font-mono text-[12.5px] text-muted-foreground">
        W{isoWeekNumber(week)} · {formatWeekRange(week)} ·{" "}
        <span className="text-foreground">
          {outside} of {pulseRows.length}
        </span>{" "}
        {outside === 1 ? "metric" : "metrics"} outside normal vs last week
      </p>

      <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1fr)_380px]">
        <PulseTable rows={pulseRows} history={rows} index={index} selected={selected?.id ?? metric} onSelect={onMetric} />
        {selected && def && (
          <div className="min-w-0 xl:sticky xl:top-20 xl:self-start">
            <div className="label-mono">{def.name}</div>
            <div className="mt-1 flex items-baseline gap-3">
              <MetricValue kind={def.kind} value={selected.value} className="text-[32px] font-medium" />
              <Delta delta={selected.deltas.wow} kind={def.kind} size="md" />
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">{def.definition}</p>
            <TrendChart rows={rows} index={index} metric={selected.id} className="mt-4 h-[260px]" />
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              Grey band: normal range (trailing 13 weeks, ±2σ). Faint line: last year. <Kbd>J</Kbd> <Kbd>K</Kbd> metric ·{" "}
              <Kbd>[</Kbd> <Kbd>]</Kbd> week
            </p>
          </div>
        )}
      </div>

      {bridge && biggest && (
        <figure className="mt-14 min-w-0 rounded-lg border border-border bg-card p-5">
          <Prompt command="bridge revenue" flags="--wow" className="mb-2" />
          <figcaption className="mb-4 text-[15px] font-medium text-balance">
            {biggest.name} moved revenue most this week
          </figcaption>
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <BridgeChart rows={rows} index={index} className="min-w-[780px]" />
          </div>
        </figure>
      )}

      <p className="mt-10 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
        How a move is judged: each change is compared with the same comparison over the previous 26 weeks, so the noise of both
        weeks is already in the spread. Beyond 2σ of its usual size it gets a filled pill. Color only means direction. The
        headline is written by fixed rules from these numbers; no model writes it.
      </p>
    </section>
  )
}
