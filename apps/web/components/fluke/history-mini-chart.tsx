"use client"

import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, XAxis, YAxis } from "recharts"
import type { FlukeResult } from "@workspace/metrics/fluke"
import { MINUS } from "@workspace/metrics/format"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@workspace/ui/components/chart"
import { cn } from "@workspace/ui/lib/utils"
import { niceTicks } from "@/lib/fluke/ticks"

const INK = "var(--chart-1)"
const axis = { tickLine: false, axisLine: false, tickMargin: 8 } as const

/** The last weeks of a series with its normal band (mean ±2σ of the weeks before) and last week called out. */
export function HistoryMiniChart({
  values,
  res,
  format,
  label,
  weeks = 13,
  className,
}: {
  values: number[]
  res: FlukeResult
  format: (v: number) => string
  label: string
  weeks?: number
  className?: string
}) {
  const shown = values.slice(-weeks)
  const n = shown.length
  const data = shown.map((value, i) => ({
    label: i === n - 1 ? "Last week" : `W${MINUS}${n - 1 - i}`,
    value,
    band: [res.range[0], res.range[1]] as [number, number],
  }))
  const lo = Math.min(...shown, res.range[0])
  const hi = Math.max(...shown, res.range[1])
  const ticks = niceTicks(lo - (hi - lo) * 0.05, hi + (hi - lo) * 0.05)
  // A real move is coloured by the move; a level that has drifted outside normal, by where it sits.
  const dir = res.call === "real" ? res.change : res.call === "building" ? res.zLevel : 0
  const dot = dir > 0 ? "var(--up)" : dir < 0 ? "var(--down)" : INK
  return (
    <ChartContainer
      config={{ value: { label, color: INK }, band: { label: "Normal week", color: "var(--band)" } } satisfies ChartConfig}
      className={cn("aspect-auto h-[200px] w-full", className)}
    >
      <ComposedChart data={data} margin={{ top: 16, right: 80, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={28} />
        <YAxis {...axis} width={64} tickFormatter={format} domain={[ticks[0]!, ticks.at(-1)!]} ticks={ticks} />
        <ChartTooltip
          cursor={{ stroke: "var(--border)" }}
          content={
            <ChartTooltipContent
              formatter={(v, name) => (
                <div className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">{name === "band" ? "Normal week" : label}</span>
                  <span className="num font-medium">
                    {Array.isArray(v) ? `${format(Number(v[0]))} – ${format(Number(v[1]))}` : format(Number(v))}
                  </span>
                </div>
              )}
            />
          }
        />
        <Area dataKey="band" type="linear" stroke="none" fill="var(--color-band)" fillOpacity={1} activeDot={false} />
        <Line dataKey="value" type="linear" stroke="var(--color-value)" strokeWidth={2.5} dot={false} activeDot={{ r: 4.5 }} />
        <ReferenceDot
          x={data.at(-1)!.label}
          y={res.last}
          r={5.5}
          fill={dot}
          stroke="var(--card)"
          strokeWidth={2.5}
          ifOverflow="visible"
          label={{ value: format(res.last), position: "right", offset: 10, fontSize: 12, fill: "var(--foreground)" }}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
