"use client"

import * as React from "react"
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, XAxis, YAxis } from "recharts"
import { formatWeek } from "@workspace/metrics/format"
import type { MetricSpec } from "@workspace/metrics"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@workspace/ui/components/chart"
import { cn } from "@workspace/ui/lib/utils"
import { formatSpecValue } from "@/lib/standard/format"
import type { TrendPoint } from "@/lib/standard/spec-view"

const INK = "var(--chart-1)"
const GREY = "var(--chart-4)"
const axis = { tickLine: false, axisLine: false, tickMargin: 8 } as const

/** Narrow charts show 13 weeks instead of 26, so every label stays 12px and every week stays readable. */
function useNarrow(ref: React.RefObject<HTMLDivElement | null>) {
  const [narrow, setNarrow] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setNarrow((e?.contentRect.width ?? 999) < 540))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return narrow
}

/**
 * The example chart on a Standard page: this year in ink, last year faint behind it, and the grey
 * normal band (trailing 13 weeks, mean ±2σ). Only the latest point is marked, and it takes a
 * direction colour only when the week's verdict is a real move.
 */
export function SpecTrendChart({
  spec,
  points,
  real,
  name,
  className,
}: {
  spec: Pick<MetricSpec, "kind" | "duration_unit">
  points: TrendPoint[]
  /** The latest week's verdict is a real move: colour the point by its direction. */
  real: boolean
  name: string
  className?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const narrow = useNarrow(ref)
  const data = React.useMemo(() => (narrow ? points.slice(-13) : points), [points, narrow])
  const last = data.at(-1)
  const prev = data.at(-2)
  const fmt = (v: number) => formatSpecValue(spec, v, true)
  const full = (v: number) => formatSpecValue(spec, v)
  const config = {
    value: { label: "This year", color: INK },
    lastYear: { label: "Last year", color: GREY },
    band: { label: "Normal range", color: "var(--band)" },
  } satisfies ChartConfig
  const dot = real && last && prev ? (last.value >= prev.value ? "var(--up)" : "var(--down)") : INK

  return (
    <div ref={ref} className={cn("min-w-0", className)}>
      <ChartContainer config={config} className="aspect-auto h-[260px] w-full sm:h-[300px]" aria-label={`${name}, example data, last ${data.length} weeks`} role="img">
        <ComposedChart data={data} margin={{ top: 16, right: narrow ? 22 : 64, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="week" {...axis} tickFormatter={formatWeek} minTickGap={narrow ? 24 : 40} />
          <YAxis {...axis} width={narrow ? 52 : 60} tickFormatter={fmt} domain={["auto", "auto"]} tickCount={4} />
          <ChartTooltip
            cursor={{ stroke: "var(--border)" }}
            content={
              <ChartTooltipContent
                labelFormatter={(v) => (typeof v === "string" ? `Week of ${formatWeek(v)}` : String(v))}
                formatter={(value, key, item) => (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-2 shrink-0 rounded-[2px]" style={{ background: item?.color ?? INK }} />
                      {config[key as keyof typeof config]?.label ?? key}
                    </span>
                    <span className="num font-medium text-foreground">
                      {Array.isArray(value) ? `${full(Number(value[0]))} – ${full(Number(value[1]))}` : full(Number(value))}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Area dataKey="band" stroke="none" fill="var(--color-band)" fillOpacity={1} type="monotone" activeDot={false} />
          <Line dataKey="lastYear" stroke="var(--color-lastYear)" strokeWidth={2} strokeOpacity={0.5} dot={false} type="linear" activeDot={{ r: 3.5 }} />
          <Line dataKey="value" stroke="var(--color-value)" strokeWidth={2.5} dot={false} type="linear" activeDot={{ r: 4.5 }} />
          {last && (
            <ReferenceDot
              x={last.week}
              y={last.value}
              r={5.5}
              fill={dot}
              stroke="var(--card)"
              strokeWidth={2.5}
              ifOverflow="visible"
              label={narrow ? undefined : { value: fmt(last.value), position: "right", offset: 10, fontSize: 12, fill: "var(--foreground)" }}
            />
          )}
          <ChartLegend verticalAlign="bottom" content={<ChartLegendContent className="justify-start gap-5 pt-5 font-mono text-[11.5px] text-muted-foreground" />} />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}
