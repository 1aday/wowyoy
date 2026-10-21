"use client"

import * as React from "react"
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, XAxis, YAxis } from "recharts"
import { formatCompact, formatWeek } from "@workspace/metrics"
import { directionOf } from "@workspace/feeds/github/read"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@workspace/ui/components/chart"
import { cn } from "@workspace/ui/lib/utils"
import type { MeasureView, RepoView } from "@/lib/gh/view"

const INK = "var(--chart-1)"
const axis = { tickLine: false, axisLine: false, tickMargin: 8 } as const
const fmt = (v: number) => (Math.abs(v) < 10000 ? Math.round(v).toLocaleString("en-US") : formatCompact(v))

/** Narrow charts show the latest 13 weeks, wide ones all 26. */
function useNarrow() {
  const [narrow, setNarrow] = React.useState(false)
  React.useEffect(() => {
    const q = window.matchMedia("(max-width: 639px)")
    const on = () => setNarrow(q.matches)
    on()
    q.addEventListener("change", on)
    return () => q.removeEventListener("change", on)
  }, [])
  return narrow
}

/** One measure's closed weeks: ink line, grey normal band, the latest week as the only dot. */
export function RepoChart({ view, measure, className }: { view: RepoView; measure: MeasureView; className?: string }) {
  const narrow = useNarrow()
  const span = narrow ? 13 : 26
  const data = React.useMemo(
    () =>
      view.weeks
        .slice(0, view.closed)
        .map((w, i) => ({ week: w.monday, value: measure.counts[i] ?? null, band: measure.bands[i] ?? null }))
        .slice(-span),
    [view, measure, span],
  )
  const last = data.at(-1)
  const call = measure.calls[view.closed - 1]
  const dir = call ? directionOf(call) : "flat"
  const dot = call?.call === "real" && dir !== "flat" ? (dir === "up" ? "var(--up)" : "var(--down)") : INK
  const config = {
    value: { label: measure.name, color: INK },
    band: { label: "Normal range", color: "var(--band)" },
  } satisfies ChartConfig

  return (
    <ChartContainer config={config} className={cn("aspect-auto h-[240px] w-full", className)}>
      <ComposedChart data={data} margin={{ top: 16, right: 48, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="week" {...axis} tickFormatter={formatWeek} minTickGap={32} />
        <YAxis {...axis} width={48} tickFormatter={fmt} domain={["auto", "auto"]} tickCount={4} allowDecimals={false} />
        <ChartTooltip
          cursor={{ stroke: "var(--border)" }}
          content={
            <ChartTooltipContent
              labelFormatter={(v) => (typeof v === "string" ? `Week of ${formatWeek(v)}` : String(v))}
              formatter={(v, n) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">{n === "band" ? "Normal range" : measure.name}</span>
                  <span className="num font-medium text-foreground">
                    {Array.isArray(v) ? `${fmt(Number(v[0]))} – ${fmt(Number(v[1]))}` : fmt(Number(v))}
                  </span>
                </div>
              )}
            />
          }
        />
        <Area dataKey="band" type="linear" stroke="none" fill="var(--color-band)" fillOpacity={1} activeDot={false} connectNulls={false} />
        <Line dataKey="value" type="linear" stroke="var(--color-value)" strokeWidth={2.5} dot={false} activeDot={{ r: 4.5 }} connectNulls={false} />
        {last && last.value != null && (
          <ReferenceDot
            x={last.week}
            y={last.value}
            r={5.5}
            fill={dot}
            stroke="var(--card)"
            strokeWidth={2.5}
            ifOverflow="visible"
            label={{ value: fmt(last.value), position: "right", offset: 10, fontSize: 12, fill: "var(--foreground)" }}
          />
        )}
      </ComposedChart>
    </ChartContainer>
  )
}
