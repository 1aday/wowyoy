"use client"

import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@workspace/ui/components/chart"
import { cn } from "@workspace/ui/lib/utils"
import { niceTicks } from "@/lib/fluke/ticks"
import { chanceBand, formatTwoWeekValue, type TwoWeekReport } from "@/lib/fluke/two-week"

const INK = "var(--chart-1)"
const axis = { tickLine: false, axisLine: false, tickMargin: 8 } as const
const BEFORE = "Week before"
const AFTER = "Last week"

/**
 * Two weeks against the sampling floor: the grey band is where last week lands by chance,
 * starting from the week before. Ink throughout; colour only on last week's dot when the move is real.
 */
export function TwoWeekChart({ report, className, label = "Value" }: { report: TwoWeekReport; className?: string; label?: string }) {
  const { kind, before, after } = report.values
  const band = chanceBand(report)
  const fmt = (v: number) => formatTwoWeekValue(kind, v)
  const axisFmt = (v: number) => (kind === "rate" ? `${Number(v.toFixed(2))}%` : fmt(v))
  const lo = Math.min(before, after, band?.[0] ?? before)
  const hi = Math.max(before, after, band?.[1] ?? before)
  const pad = (hi - lo || Math.abs(before) || 1) * 0.12
  const ticks = niceTicks(Math.max(0, lo - pad), hi + pad)
  const domain: [number, number] = [ticks[0]!, ticks.at(-1)!]
  const dot = report.significant ? (report.direction === "up" ? "var(--up)" : "var(--down)") : INK
  const data = [
    { i: 0, x: BEFORE, value: before },
    { i: 1, x: AFTER, value: after },
  ]

  return (
    <ChartContainer
      config={{ value: { label, color: INK }, band: { label: "Chance range", color: "var(--band)" } } satisfies ChartConfig}
      className={cn("aspect-auto h-[220px] w-full", className)}
    >
      <ComposedChart data={data} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        {band ? (
          <ReferenceArea
            x1={0}
            x2={1}
            y1={band[0]}
            y2={band[1]}
            fill="var(--color-band)"
            fillOpacity={1}
            ifOverflow="extendDomain"
            label={{
              value: `Chance ${report.floor!.label}`,
              position: report.direction === "up" ? "insideBottomRight" : "insideTopRight",
              offset: 8,
              fontSize: 12,
              fill: "var(--muted-foreground)",
            }}
          />
        ) : null}
        <XAxis
          type="number"
          dataKey="i"
          {...axis}
          domain={[-0.28, 1.4]}
          ticks={[0, 1]}
          tickFormatter={(i: number) => (i === 0 ? BEFORE : AFTER)}
          allowDataOverflow
        />
        <YAxis {...axis} width={64} tickFormatter={axisFmt} domain={domain} ticks={ticks} />
        <ChartTooltip
          cursor={{ stroke: "var(--border)" }}
          content={
            <ChartTooltipContent
              hideIndicator
              hideLabel
              formatter={(v, _n, item) => (
                <div className="grid w-full gap-1">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{(item.payload as { x?: string } | undefined)?.x ?? label}</span>
                    <span className="num font-medium">{fmt(Number(v))}</span>
                  </div>
                  {band ? (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Chance range</span>
                      <span className="num font-medium">
                        {fmt(band[0])} – {fmt(band[1])}
                      </span>
                    </div>
                  ) : null}
                </div>
              )}
            />
          }
        />
        <Line dataKey="value" type="linear" stroke="var(--color-value)" strokeWidth={2.5} dot={false} activeDot={{ r: 4.5 }} />
        <ReferenceDot
          x={0}
          y={before}
          r={4}
          fill="var(--card)"
          stroke={INK}
          strokeWidth={2}
          ifOverflow="visible"
          label={{ value: fmt(before), position: "top", offset: 10, fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <ReferenceDot
          x={1}
          y={after}
          r={5.5}
          fill={dot}
          stroke="var(--card)"
          strokeWidth={2.5}
          ifOverflow="visible"
          label={{ value: fmt(after), position: "right", offset: 10, fontSize: 12, fill: "var(--foreground)" }}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
