"use client"

/**
 * The kit charts, built from stock Recharts components
 * through shadcn's ChartContainer. We supply tokens, data and formatters only:
 * no custom shapes, curves, dots or label renderers.
 */

import * as React from "react"
import {
  Area,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  ErrorBar,
  LabelList,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ReferenceDot,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"
import {
  channelNames,
  channels,
  formatChange,
  formatCompact,
  formatValue,
  formatWeek,
  metricById,
  normalBand,
  type Channel,
  type MetricId,
  type MetricKind,
  type MetricWeek,
  type WeekRow,
} from "@workspace/metrics"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"
import { cn } from "@workspace/ui/lib/utils"

const INK = "var(--chart-1)"
const BLUE = "var(--chart-2)"
const AMBER = "var(--chart-3)"
const GREY = "var(--chart-4)"
const UPC = "var(--up)"
const DOWNC = "var(--down)"
const BAND = "var(--band)"
const LINE = "var(--border)"
const SURFACE = "var(--card)"

const axis = { tickLine: false, axisLine: false, tickMargin: 8 } as const

/** Tooltip rows: label on the left, the formatted number on the right in Mono. */
function valueFormatter(config: ChartConfig, fmt: (v: number, key: string) => string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (value: any, name: any, item: any) => {
    const key = String(name)
    const color = item?.color ?? item?.payload?.fill ?? INK
    const text = Array.isArray(value)
      ? `${fmt(Number(value[0]), key)} – ${fmt(Number(value[1]), key)}`
      : fmt(Number(value), key)
    return (
      <div className="flex w-full items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2 shrink-0 rounded-[2px]" style={{ background: color }} />
          {config[key]?.label ?? key}
        </span>
        <span className="num font-medium text-foreground">{text}</span>
      </div>
    )
  }
}

function weekLabel(v: unknown) {
  return typeof v === "string" ? `Week of ${formatWeek(v)}` : String(v)
}

/* 1. Trend with normal band ------------------------------------------------ */

export function TrendChart({
  rows,
  index,
  metric,
  weeks = 26,
  className,
}: {
  rows: readonly MetricWeek[]
  index: number
  metric: MetricId
  weeks?: number
  className?: string
}) {
  const def = metricById[metric]
  const data = React.useMemo(() => {
    const out = []
    for (let k = Math.max(0, index - weeks + 1); k <= index; k++) {
      const b = normalBand(rows, metric, k)
      out.push({
        week: rows[k]!.week,
        value: rows[k]!.values[metric] ?? null,
        lastYear: rows[k - 52]?.values[metric] ?? null,
        band: b ? [b.lo, b.hi] : null,
      })
    }
    return out
  }, [rows, index, metric, weeks])
  const last = data.at(-1)
  const outside = last?.band && last.value != null && (last.value > last.band[1]! || last.value < last.band[0]!)
  const config = {
    value: { label: "This year", color: INK },
    lastYear: { label: "Last year", color: GREY },
    band: { label: "Normal range", color: BAND },
  } satisfies ChartConfig
  const fmt = (v: number) => formatValue(def, v)
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-[280px] w-full", className)}>
      <ComposedChart data={data} margin={{ top: 12, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={LINE} />
        <XAxis dataKey="week" {...axis} tickFormatter={formatWeek} minTickGap={32} />
        <YAxis {...axis} width={56} tickFormatter={fmt} domain={["auto", "auto"]} tickCount={4} />
        <ChartTooltip
          cursor={{ stroke: LINE }}
          content={<ChartTooltipContent labelFormatter={weekLabel} formatter={valueFormatter(config, fmt)} />}
        />
        <Area dataKey="band" stroke="none" fill="var(--color-band)" fillOpacity={1} type="monotone" activeDot={false} />
        <Line dataKey="lastYear" stroke="var(--color-lastYear)" strokeWidth={2} strokeOpacity={0.55} dot={false} type="linear" />
        <Line dataKey="value" stroke="var(--color-value)" strokeWidth={2.5} dot={false} type="linear" activeDot={{ r: 5 }} />
        {last && last.value != null && (
          <ReferenceDot
            x={last.week}
            y={last.value}
            r={5.5}
            fill={outside ? (last.value > last.band![1]! ? UPC : DOWNC) : INK}
            stroke={SURFACE}
            strokeWidth={2.5}
          />
        )}
        <Brush dataKey="week" height={22} stroke={LINE} fill={SURFACE} tickFormatter={formatWeek} travellerWidth={8} />
      </ComposedChart>
    </ChartContainer>
  )
}

/* 2. Sparkline ------------------------------------------------------------- */

export function Sparkline({
  values,
  kind,
  className,
}: {
  values: { week: string; value: number }[]
  kind: MetricKind
  className?: string
}) {
  const config = { value: { label: "Value", color: INK } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-[22px] w-[76px]", className)}>
      <LineChart data={values} margin={{ top: 3, right: 3, bottom: 3, left: 3 }}>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={weekLabel}
              formatter={valueFormatter(config, (v) => formatValue({ kind }, v))}
            />
          }
        />
        <Line dataKey="value" stroke="var(--color-value)" strokeWidth={1.5} dot={false} type="linear" isAnimationActive={false} activeDot={{ r: 2.5 }} />
      </LineChart>
    </ChartContainer>
  )
}

/* 3. Columns: totals per week, this week in ink ----------------------------- */

export function ColumnsChart({
  rows,
  index,
  metric,
  weeks = 13,
  className,
}: {
  rows: WeekRow[]
  index: number
  metric: MetricId
  weeks?: number
  className?: string
}) {
  const def = metricById[metric]
  const data = rows.slice(Math.max(0, index - weeks + 1), index + 1).map((r) => ({ week: r.week, value: r.values[metric] }))
  const avg = data.slice(0, -1).reduce((a, b) => a + b.value, 0) / Math.max(1, data.length - 1)
  const config = { value: { label: def.short, color: INK } } satisfies ChartConfig
  const fmt = (v: number) => formatValue(def, v)
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-[200px] w-full", className)}>
      <BarChart data={data} margin={{ top: 12, right: 36, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={LINE} />
        <XAxis dataKey="week" {...axis} tickFormatter={formatWeek} minTickGap={24} />
        <YAxis {...axis} width={56} tickFormatter={fmt} tickCount={4} />
        <ChartTooltip cursor={{ fill: "var(--accent)" }} content={<ChartTooltipContent labelFormatter={weekLabel} formatter={valueFormatter(config, fmt)} />} />
        <Bar dataKey="value" radius={[5, 5, 0, 0]} maxBarSize={32}>
          {data.map((d, k) => (
            <Cell key={d.week} fill={k === data.length - 1 ? INK : GREY} fillOpacity={k === data.length - 1 ? 1 : 0.45} />
          ))}
        </Bar>
        <ReferenceLine y={avg} stroke={INK} strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: "avg", position: "right", fill: "var(--muted-foreground)", fontSize: 12 }} />
      </BarChart>
    </ChartContainer>
  )
}

/* 4. Revenue bridge: what moved revenue from last week to this week ---------- */

const bridgeIds = ["sessions", "product_view_rate", "add_to_cart_rate", "checkout_start_rate", "checkout_completion_rate", "aov", "revenue"] as const

/** True when a source has every step of the revenue bridge for these two weeks. */
export function hasBridge(rows: readonly MetricWeek[], index: number) {
  return index > 0 && bridgeIds.every((id) => (rows[index]?.values[id] ?? 0) > 0 && (rows[index - 1]?.values[id] ?? 0) > 0)
}

export function bridgeSteps(rows: readonly MetricWeek[], index: number) {
  const a = rows[index - 1]!.values as Record<(typeof bridgeIds)[number], number>
  const b = rows[index]!.values as Record<(typeof bridgeIds)[number], number>
  const steps: { name: string; ratio: number }[] = [
    { name: "Traffic", ratio: b.sessions / a.sessions },
    { name: "Product views", ratio: b.product_view_rate / a.product_view_rate },
    { name: "Add to cart", ratio: b.add_to_cart_rate / a.add_to_cart_rate },
    { name: "Checkout start", ratio: b.checkout_start_rate / a.checkout_start_rate },
    { name: "Checkout", ratio: b.checkout_completion_rate / a.checkout_completion_rate },
    { name: "Order value", ratio: b.aov / a.aov },
  ]
  // Log-share attribution so the steps add up exactly to the total change.
  const total = b.revenue - a.revenue
  const logTotal = Math.log(b.revenue / a.revenue) || 1e-9
  let running = a.revenue
  const out: { name: string; range: [number, number]; change: number; kind: "total" | "up" | "down" }[] = [
    { name: "Last week", range: [0, a.revenue], change: a.revenue, kind: "total" },
  ]
  for (const s of steps) {
    const change = (total * Math.log(s.ratio)) / logTotal
    const next = running + change
    out.push({ name: s.name, range: [Math.min(running, next), Math.max(running, next)], change, kind: change >= 0 ? "up" : "down" })
    running = next
  }
  out.push({ name: "This week", range: [0, b.revenue], change: b.revenue, kind: "total" })
  return out
}

export function BridgeChart({ rows, index, className }: { rows: readonly MetricWeek[]; index: number; className?: string }) {
  const data = React.useMemo(() => bridgeSteps(rows, index), [rows, index])
  const lo = Math.min(...data.filter((d) => d.kind !== "total").map((d) => d.range[0]))
  const config = { range: { label: "Revenue", color: INK } } satisfies ChartConfig
  const money = (v: number) => formatValue({ kind: "currency" }, v)
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-[260px] w-full", className)}>
      <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={LINE} />
        <XAxis dataKey="name" {...axis} interval={0} tick={{ fontSize: 11 }} />
        <YAxis {...axis} width={56} tickFormatter={money} domain={[lo * 0.97, "auto"]} allowDataOverflow tickCount={4} />
        <ChartTooltip
          cursor={{ fill: "var(--accent)" }}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(_v, _n, item) => {
                const d = item.payload as (typeof data)[number]
                return (
                  <div className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">{d.kind === "total" ? "Revenue" : "Effect"}</span>
                    <span className={cn("num font-medium", d.kind === "up" && "text-up", d.kind === "down" && "text-down")}>
                      {d.kind === "total" ? money(d.change) : `${d.change < 0 ? "−" : "+"}${money(Math.abs(d.change))}`}
                    </span>
                  </div>
                )
              }}
            />
          }
        />
        <Bar dataKey="range" radius={5} maxBarSize={32}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.kind === "total" ? INK : d.kind === "up" ? UPC : DOWNC} />
          ))}
          <LabelList
            dataKey="change"
            position="top"
            className="num"
            fill="var(--muted-foreground)"
            fontSize={11}
            formatter={(v: unknown) => {
              const n = Number(v)
              return Math.abs(n) > 1e5 && data.some((d) => d.kind === "total" && d.change === n)
                ? money(n)
                : `${n < 0 ? "−" : "+"}${formatCompact(Math.abs(n))}`
            }}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/* 5. Funnel: one row per stage, bar to scale on a grey track, step rate beside it */

export function FunnelStages({ row, prev, className }: { row: WeekRow; prev?: WeekRow; className?: string }) {
  const stages = (r: WeekRow) => [
    { name: "Sessions", value: r.values.sessions },
    { name: "Viewed product", value: r.counts.product_views },
    { name: "Added to cart", value: r.counts.carts },
    { name: "Started checkout", value: r.counts.checkouts },
    { name: "Ordered", value: r.values.orders },
  ]
  const now = stages(row)
  const before = prev ? stages(prev) : null
  const data = now.map((d, k) => {
    const step = k ? d.value / now[k - 1]!.value : null
    const stepPrev = k && before ? before[k]!.value / before[k - 1]!.value : null
    return {
      ...d,
      share: d.value / now[0]!.value,
      label: `${formatCompact(d.value)}${step != null ? `  ${(step * 100).toFixed(1)}%` : ""}`,
      stepChange: step != null && stepPrev != null ? step - stepPrev : null,
    }
  })
  const config = { share: { label: "Of sessions", color: INK } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-[230px] w-full", className)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 112, left: 0, bottom: 0 }} barSize={10}>
        <XAxis type="number" hide domain={[0, 1]} />
        <YAxis type="category" dataKey="name" {...axis} width={124} tick={{ className: "wy-name" }} />
        <ChartTooltip
          cursor={{ fill: "var(--accent)" }}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(_v, _n, item) => {
                const d = item.payload as (typeof data)[number]
                return (
                  <div className="grid gap-0.5">
                    <span className="num font-medium">{d.value.toLocaleString("en-US")}</span>
                    <span className="num text-muted-foreground">
                      {(d.share * 100).toFixed(1)}% of sessions
                      {d.stepChange != null ? ` · step ${formatChange("rate", d.stepChange)} wow` : ""}
                    </span>
                  </div>
                )
              }}
            />
          }
        />
        <Bar dataKey="share" fill="var(--color-share)" radius={5} background={{ fill: "var(--muted)", radius: 5 }} minPointSize={3}>
          <LabelList dataKey="label" position="right" offset={10} fill="var(--foreground)" fontSize={12} className="num" />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/* 6. Cohort grid (a table with an ink ramp, values printed) ------------------- */

function inkRamp(v: number, lo = 0.06, hi = 0.8) {
  const pct = Math.round((lo + (hi - lo) * Math.max(0, Math.min(1, v))) * 100)
  return { background: `color-mix(in oklab, var(--foreground) ${pct}%, transparent)`, color: pct > 45 ? "var(--background)" : "var(--foreground)" }
}

export function CohortGrid({
  data,
  className,
}: {
  data: { cohort: string; size: number; retention: (number | null)[] }[]
  className?: string
}) {
  const cols = data[0]?.retention.length ?? 0
  const max = Math.max(...data.flatMap((d) => d.retention.slice(1).filter((x): x is number => x != null)))
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="num w-full border-separate border-spacing-[2px] text-[12px]">
        <thead>
          <tr>
            <th className="label-mono pr-3 text-left font-medium">Cohort</th>
            <th className="label-mono pr-3 text-right font-medium">Size</th>
            {Array.from({ length: cols - 1 }, (_, n) => (
              <th key={n} className="label-mono w-10 text-center font-medium">
                M{n + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.cohort}>
              <td className="pr-3 text-muted-foreground">{d.cohort}</td>
              <td className="pr-3 text-right text-muted-foreground">{formatCompact(d.size)}</td>
              {d.retention.slice(1).map((v, n) => (
                <td key={n} className="h-7 rounded-[3px] text-center" style={v == null ? undefined : inkRamp(v / max)}>
                  {v == null ? "" : `${Math.round(v * 100)}`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* 7. Experiment intervals ----------------------------------------------------- */

export function IntervalsChart({
  data,
  className,
}: {
  data: { name: string; lift: number; lo: number; hi: number }[]
  className?: string
}) {
  const rows = data.map((d) => ({ ...d, err: [d.lift - d.lo, d.hi - d.lift] as [number, number], clear: d.lo > 0 || d.hi < 0 }))
  const config = { lift: { label: "Lift", color: INK } } satisfies ChartConfig
  const pct = (v: number) => formatChange("count", v)
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-[240px] w-full", className)}>
      <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={LINE} />
        <XAxis type="number" dataKey="lift" {...axis} tickFormatter={pct} domain={["auto", "auto"]} />
        <YAxis type="category" dataKey="name" {...axis} width={176} tick={{ className: "wy-name" }} allowDuplicatedCategory={false} />
        <ReferenceLine x={0} stroke={INK} strokeOpacity={0.5} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(_v, _n, item) => {
                const d = item.payload as (typeof rows)[number]
                return (
                  <div className="grid gap-0.5">
                    <span className="font-medium">{d.name}</span>
                    <span className="num text-muted-foreground">
                      {pct(d.lift)} ({pct(d.lo)} to {pct(d.hi)})
                    </span>
                  </div>
                )
              }}
            />
          }
        />
        <Scatter data={rows} fill={INK}>
          {rows.map((d) => (
            <Cell key={d.name} fill={d.clear ? (d.lift > 0 ? UPC : DOWNC) : SURFACE} stroke={d.clear ? "none" : GREY} strokeWidth={2} />
          ))}
          <ErrorBar dataKey="err" direction="x" width={6} stroke={INK} strokeWidth={1.5} strokeOpacity={0.6} />
        </Scatter>
      </ScatterChart>
    </ChartContainer>
  )
}

/* 8. Ranked bars: channels by revenue ---------------------------------------- */

export function RankedBars({ row, className }: { row: WeekRow; className?: string }) {
  const data = channels
    .map((c) => ({ name: channelNames[c], value: row.byChannel[c].revenue }))
    .sort((a, b) => b.value - a.value)
  const config = { value: { label: "Revenue", color: INK } } satisfies ChartConfig
  const money = (v: number) => formatValue({ kind: "currency" }, v)
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-[200px] w-full", className)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }} barSize={10}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" {...axis} width={96} tick={{ className: "wy-name" }} />
        <ChartTooltip cursor={{ fill: "var(--accent)" }} content={<ChartTooltipContent formatter={valueFormatter(config, money)} />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={5} background={{ fill: "var(--muted)", radius: 5 }}>
          <LabelList dataKey="value" position="right" offset={10} fill="var(--foreground)" fontSize={12} className="num" formatter={(v: unknown) => money(Number(v))} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/* 9. Pacing against plan ------------------------------------------------------ */

export function PacingChart({
  data,
  elapsed,
  className,
}: {
  data: { name: string; actual: number; plan: number }[]
  /** Share of the period gone, 0..1 */
  elapsed: number
  className?: string
}) {
  const rows = data.map((d) => ({ ...d, pct: d.actual / d.plan }))
  const config = { pct: { label: "Of plan", color: INK } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-[180px] w-full", className)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 16, right: 56, left: 0, bottom: 0 }} barSize={10}>
        <XAxis type="number" hide domain={[0, 1.2]} />
        <YAxis type="category" dataKey="name" {...axis} width={124} tick={{ className: "wy-name" }} />
        <ReferenceLine x={elapsed} stroke={INK} strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: `${Math.round(elapsed * 100)}% of quarter`, position: "top", fontSize: 11, fill: "var(--muted-foreground)" }} />
        <ChartTooltip cursor={{ fill: "var(--accent)" }} content={<ChartTooltipContent formatter={valueFormatter(config, (v) => `${Math.round(v * 100)}%`)} />} />
        <Bar dataKey="pct" radius={5} background={{ fill: "var(--muted)", radius: 5 }}>
          {rows.map((d) => (
            <Cell key={d.name} fill={INK} />
          ))}
          <LabelList dataKey="pct" position="right" offset={10} fill="var(--foreground)" fontSize={12} className="num" formatter={(v: unknown) => `${Math.round(Number(v) * 100)}%`} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/* 10. Stacked share over time ------------------------------------------------- */

export function StackedShare({ rows, index, weeks = 26, className }: { rows: WeekRow[]; index: number; weeks?: number; className?: string }) {
  const data = rows.slice(Math.max(0, index - weeks + 1), index + 1).map((r) => ({
    week: r.week,
    mobile: r.byDevice.mobile.orders,
    desktop: r.byDevice.desktop.orders,
  }))
  const config = { mobile: { label: "Mobile", color: INK }, desktop: { label: "Desktop", color: GREY } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-[220px] w-full", className)}>
      <BarChart data={data} stackOffset="expand" margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
        <XAxis dataKey="week" {...axis} tickFormatter={formatWeek} minTickGap={32} />
        <YAxis {...axis} width={40} tickFormatter={(v) => `${Math.round(v * 100)}%`} ticks={[0, 0.5, 1]} />
        <ChartTooltip cursor={{ fill: "var(--accent)" }} content={<ChartTooltipContent labelFormatter={weekLabel} formatter={valueFormatter(config, (v) => formatCompact(v))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="mobile" stackId="a" fill="var(--color-mobile)" stroke={SURFACE} strokeWidth={1} />
        <Bar dataKey="desktop" stackId="a" fill="var(--color-desktop)" stroke={SURFACE} strokeWidth={1} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}

/* 11. Bubble: channels on conversion × order value, area = revenue ------------- */

export function BubbleChart({ row, className }: { row: WeekRow; className?: string }) {
  const data = channels.map((c) => {
    const ch = row.byChannel[c]
    return { name: channelNames[c], conv: ch.orders / ch.sessions, aov: ch.revenue / ch.orders, revenue: ch.revenue }
  })
  const config = { revenue: { label: "Revenue", color: INK } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-[260px] w-full", className)}>
      <ScatterChart margin={{ top: 36, right: 40, left: 0, bottom: 8 }}>
        <CartesianGrid stroke={LINE} />
        <XAxis type="number" dataKey="conv" name="Conversion" {...axis} tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} domain={["dataMin - 0.004", "dataMax + 0.004"]} tickCount={5} />
        <YAxis type="number" dataKey="aov" name="AOV" {...axis} width={56} tickFormatter={(v) => `$${Math.round(v)}`} domain={["dataMin - 6", "dataMax + 6"]} tickCount={5} />
        <ZAxis type="number" dataKey="revenue" range={[120, 1800]} name="Revenue" />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(_v, _n, item) => {
                const d = item.payload as (typeof data)[number]
                return (
                  <div className="grid gap-0.5">
                    <span className="font-medium">{d.name}</span>
                    <span className="num text-muted-foreground">
                      {(d.conv * 100).toFixed(2)}% conv · ${d.aov.toFixed(0)} AOV · {formatValue({ kind: "currency" }, d.revenue)}
                    </span>
                  </div>
                )
              }}
            />
          }
        />
        <Scatter data={data} fill={INK} fillOpacity={0.09} stroke={INK} strokeWidth={1.5}>
          <LabelList dataKey="name" position="right" offset={18} fill="var(--foreground)" fontSize={12} />
        </Scatter>
      </ScatterChart>
    </ChartContainer>
  )
}

/* 12. Time of day: radar, this week vs last week ------------------------------- */

export function TimeOfDayRadar({
  current,
  previous,
  className,
}: {
  current: { block: string; orders: number }[]
  previous: { block: string; orders: number }[]
  className?: string
}) {
  const sum = (xs: { block: string; orders: number }[]) => {
    const m = new Map<string, number>()
    for (const x of xs) m.set(x.block, (m.get(x.block) ?? 0) + x.orders)
    return m
  }
  const a = sum(current)
  const b = sum(previous)
  const data = [...a.keys()].map((k) => ({ block: `${k}:00`, current: a.get(k) ?? 0, previous: b.get(k) ?? 0 }))
  const config = { current: { label: "This week", color: INK }, previous: { label: "Last week", color: GREY } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className={cn("mx-auto aspect-square h-[260px]", className)}>
      <RadarChart data={data} outerRadius="72%">
        <ChartTooltip content={<ChartTooltipContent formatter={valueFormatter(config, (v) => formatCompact(v))} />} />
        <PolarGrid stroke={LINE} />
        <PolarAngleAxis dataKey="block" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <Radar dataKey="previous" stroke="var(--color-previous)" fill="none" strokeWidth={2} strokeOpacity={0.6} />
        <Radar dataKey="current" stroke="var(--color-current)" fill="var(--color-current)" fillOpacity={0.08} strokeWidth={2.5} />
        <ChartLegend content={<ChartLegendContent />} />
      </RadarChart>
    </ChartContainer>
  )
}

/* 13. Heatmap: weekday × 3-hour block, one ink ramp, values printed ------------- */

export function Heatmap({ cells, className }: { cells: { day: string; block: string; orders: number }[]; className?: string }) {
  const days = [...new Set(cells.map((c) => c.day))]
  const blocks = [...new Set(cells.map((c) => c.block))]
  const max = Math.max(...cells.map((c) => c.orders))
  const get = (d: string, b: string) => cells.find((c) => c.day === d && c.block === b)?.orders ?? 0
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="num w-full border-separate border-spacing-[2px] text-[12px]">
        <thead>
          <tr>
            <th />
            {blocks.map((b) => (
              <th key={b} className="label-mono text-center font-medium">
                {b}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d}>
              <td className="pr-2 text-muted-foreground">{d}</td>
              {blocks.map((b) => {
                const v = get(d, b)
                return (
                  <td
                    key={b}
                    title={`${d} ${b}:00 · ${v.toLocaleString("en-US")} orders`}
                    className={cn("h-8 rounded-[3px] text-center", v === max && "font-semibold")}
                    style={inkRamp(v / max, 0.04, 0.8)}
                  >
                    {formatCompact(v)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* 14. Histogram: where this week sits among the last two years ---------------- */

export function Histogram({ rows, index, metric, bins = 16, className }: { rows: WeekRow[]; index: number; metric: MetricId; bins?: number; className?: string }) {
  const def = metricById[metric]
  const xs = rows.slice(Math.max(0, index - 103), index + 1).map((r) => r.values[metric])
  const min = Math.min(...xs)
  const max = Math.max(...xs)
  const w = (max - min) / bins || 1
  const sorted = [...xs].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.25)]!
  const q3 = sorted[Math.floor(sorted.length * 0.75)]!
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const current = rows[index]!.values[metric]
  const fmt = (v: number) => formatValue(def, v)
  const binOf = (x: number) => Math.min(bins - 1, Math.floor((x - min) / w))
  const data = Array.from({ length: bins }, (_, k) => {
    const lo = min + k * w
    const hi = lo + w
    return { bin: fmt(lo), lo, hi, count: xs.filter((x) => binOf(x) === k).length }
  })
  const config = { count: { label: "Weeks", color: INK } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-[200px] w-full", className)}>
      <BarChart data={data} barCategoryGap={2} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="bin" {...axis} interval={3} />
        <YAxis {...axis} width={28} allowDecimals={false} tickCount={3} />
        <ChartTooltip
          cursor={{ fill: "var(--accent)" }}
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(_v, _n, item) => {
                const d = item.payload as (typeof data)[number]
                return (
                  <div className="flex w-full justify-between gap-4">
                    <span className="num text-muted-foreground">
                      {fmt(d.lo)} – {fmt(d.hi)}
                    </span>
                    <span className="num font-medium">{d.count} wks</span>
                  </div>
                )
              }}
            />
          }
        />
        <Bar dataKey="count" radius={[2, 2, 0, 0]}>
          {data.map((d) => {
            const mid = d.hi > q1 && d.lo < q3
            return <Cell key={d.bin} fill={mid ? INK : GREY} fillOpacity={mid ? 0.85 : 0.5} />
          })}
        </Bar>
        <ReferenceLine x={data[binOf(mean)]!.bin} stroke={INK} strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: "mean", position: "top", fontSize: 11, fill: "var(--muted-foreground)" }} />
        <ReferenceLine x={data[binOf(current)]!.bin} stroke={BLUE} strokeWidth={2} label={{ value: "this week", position: "top", fontSize: 11, fill: "var(--foreground)" }} />
      </BarChart>
    </ChartContainer>
  )
}

/* 15. Slope: channel conversion, same week last year vs this week --------------- */

export function SlopeChart({ rows, index, className }: { rows: WeekRow[]; index: number; className?: string }) {
  const now = rows[index]!
  const then = rows[index - 52]
  if (!then) return null
  const conv = (r: WeekRow, c: Channel) => r.byChannel[c].orders / r.byChannel[c].sessions
  const moves = channels.map((c) => ({ c, rel: conv(now, c) / conv(then, c) - 1 }))
  const biggest = moves.reduce((a, b) => (Math.abs(b.rel) > Math.abs(a.rel) ? b : a))
  const pct = (v: unknown) => `${(Number(v) * 100).toFixed(2)}%`
  // Label keys exist only on the end they label, so each side gets its own LabelList.
  const data = [
    {
      period: "Last year",
      ...Object.fromEntries(channels.flatMap((c) => [[c, conv(then, c)], [`${c}_l`, `${channelNames[c]} ${pct(conv(then, c))}`]])),
    },
    {
      period: "This week",
      ...Object.fromEntries(channels.flatMap((c) => [[c, conv(now, c)], [`${c}_r`, `${pct(conv(now, c))} ${channelNames[c]}`]])),
    },
  ]
  const config = Object.fromEntries(
    channels.map((c) => [c, { label: channelNames[c], color: c === biggest.c ? (biggest.rel > 0 ? UPC : DOWNC) : GREY }]),
  ) satisfies ChartConfig
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-[260px] w-full", className)}>
      <LineChart data={data} margin={{ top: 16, right: 140, left: 140, bottom: 0 }}>
        <XAxis dataKey="period" {...axis} padding={{ left: 8, right: 8 }} />
        <YAxis hide domain={["auto", "auto"]} />
        <ChartTooltip content={<ChartTooltipContent formatter={valueFormatter(config, (v) => pct(v))} />} />
        {channels.map((c) => (
          <Line key={c} dataKey={c} stroke={`var(--color-${c})`} strokeWidth={c === biggest.c ? 2.5 : 2} dot={{ r: 3, fill: `var(--color-${c})`, strokeWidth: 0 }} type="linear">
            <LabelList dataKey={`${c}_l`} position="left" offset={10} fontSize={11} fill="var(--muted-foreground)" />
            <LabelList dataKey={`${c}_r`} position="right" offset={10} fontSize={11} fill={c === biggest.c ? "var(--foreground)" : "var(--muted-foreground)"} />
          </Line>
        ))}
      </LineChart>
    </ChartContainer>
  )
}

/* 16. Small multiples: sessions by channel, indexed, shared crosshair ---------- */

export function SmallMultiples({ rows, index, weeks = 26, className }: { rows: WeekRow[]; index: number; weeks?: number; className?: string }) {
  const slice = rows.slice(Math.max(0, index - weeks + 1), index + 1)
  const series = channels.map((c) => {
    const base = slice[0]!.byChannel[c].sessions
    return { c, data: slice.map((r) => ({ week: r.week, value: (r.byChannel[c].sessions / base) * 100 })) }
  })
  const all = series.flatMap((s) => s.data.map((d) => d.value))
  const domain: [number, number] = [Math.floor(Math.min(...all) / 10) * 10, Math.ceil(Math.max(...all) / 10) * 10]
  return (
    <div className={cn("grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3", className)}>
      {series.map((s) => {
        const config = { value: { label: channelNames[s.c], color: INK } } satisfies ChartConfig
        const last = s.data.at(-1)!.value
        return (
          <div key={s.c} className="min-w-0">
            <div className="mb-1 flex items-baseline justify-between text-[13px]">
              <span>{channelNames[s.c]}</span>
              <span className="num text-muted-foreground">{last.toFixed(0)}</span>
            </div>
            <ChartContainer config={config} className="aspect-auto h-[88px] w-full">
              <LineChart data={s.data} syncId="channels" margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <ReferenceLine y={100} stroke={LINE} />
                <YAxis hide domain={domain} />
                <XAxis dataKey="week" hide />
                <ChartTooltip cursor={{ stroke: LINE }} content={<ChartTooltipContent labelFormatter={weekLabel} formatter={valueFormatter(config, (v) => v.toFixed(0))} />} />
                <Line dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} type="linear" activeDot={{ r: 3.5 }} />
              </LineChart>
            </ChartContainer>
          </div>
        )
      })}
    </div>
  )
}

/* 17. Share bar (instead of a pie) ------------------------------------------------ */

export function ShareBar({ row, prev, className }: { row: WeekRow; prev: WeekRow; className?: string }) {
  const ranked = channels.map((c) => ({ c, v: row.byChannel[c].revenue, p: prev.byChannel[c].revenue })).sort((a, b) => b.v - a.v)
  const top = ranked.slice(0, 3)
  const rest = ranked.slice(3)
  const parts = [
    ...top.map((t) => ({ key: t.c as string, name: channelNames[t.c], v: t.v, p: t.p })),
    { key: "other", name: "Other", v: rest.reduce((a, b) => a + b.v, 0), p: rest.reduce((a, b) => a + b.p, 0) },
  ]
  const total = parts.reduce((a, b) => a + b.v, 0)
  const colors = [INK, BLUE, AMBER, GREY]
  const config = Object.fromEntries(parts.map((p, k) => [p.key, { label: p.name, color: colors[k] }])) satisfies ChartConfig
  const datum = [Object.fromEntries([["name", "Revenue"], ...parts.map((p) => [p.key, p.v])])]
  return (
    <div className={className}>
      <ChartContainer config={config} className="aspect-auto h-[22px] w-full">
        <BarChart data={datum} layout="vertical" stackOffset="expand" margin={{ top: 3, right: 0, bottom: 3, left: 0 }} barSize={16}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" hide />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel formatter={valueFormatter(config, (v) => `${formatValue({ kind: "currency" }, v)} · ${((v / total) * 100).toFixed(0)}%`)} />} />
          {parts.map((p, k) => (
            <Bar
              key={p.key}
              dataKey={p.key}
              stackId="s"
              fill={`var(--color-${p.key})`}
              stroke={SURFACE}
              strokeWidth={2}
              radius={k === 0 ? [8, 0, 0, 8] : k === parts.length - 1 ? [0, 8, 8, 0] : 0}
            />
          ))}
        </BarChart>
      </ChartContainer>
      <table className="mt-3 w-full text-[13px]">
        <tbody>
          {parts.map((p, k) => {
            const rel = p.v / p.p - 1
            return (
              <tr key={p.key} className="border-t border-border first:border-t-0">
                <td className="py-1.5">
                  <span className="mr-2 inline-block size-2 rounded-[2px] align-middle" style={{ background: colors[k] }} />
                  {p.name}
                </td>
                <td className="num py-1.5 text-right">{formatValue({ kind: "currency" }, p.v)}</td>
                <td className="num w-14 py-1.5 text-right text-muted-foreground">{((p.v / total) * 100).toFixed(0)}%</td>
                <td className={cn("num w-16 py-1.5 text-right", rel >= 0 ? "text-up" : "text-down")}>{formatChange("count", rel)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
