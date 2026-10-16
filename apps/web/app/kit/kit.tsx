"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { parseAsString, useQueryState } from "nuqs"
import { ChevronLeft, ChevronRight, Command as CommandIcon, Moon, Sun } from "lucide-react"
import {
  catalog,
  cohorts,
  comparisonLabels,
  experiments,
  formatCompact,
  formatValue,
  formatWeekRange,
  generateStore,
  metricById,
  pulse,
  timeOfDay,
  verdict,
  type MetricId,
} from "@workspace/metrics"
import { Button } from "@workspace/ui/components/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@workspace/ui/components/command"
import { Kbd } from "@workspace/ui/components/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { Delta } from "@workspace/ui/brand/delta"
import { Logo } from "@workspace/ui/brand/logo"
import { MetricValue } from "@workspace/ui/brand/metric-value"
import { PixelMark, pixelMarkNames, pixelMarks, type PixelMarkName } from "@workspace/ui/brand/pixel-mark"
import { Prompt } from "@workspace/ui/brand/prompt"
import { PulseTable } from "@workspace/ui/brand/pulse-table"
import { Verdict } from "@workspace/ui/brand/verdict"
import {
  BridgeChart,
  BubbleChart,
  CohortGrid,
  ColumnsChart,
  FunnelStages,
  Heatmap,
  Histogram,
  IntervalsChart,
  PacingChart,
  RankedBars,
  ShareBar,
  SlopeChart,
  SmallMultiples,
  StackedShare,
  TimeOfDayRadar,
  TrendChart,
  bridgeSteps,
} from "@workspace/ui/brand/chart-kit"
import { cn } from "@workspace/ui/lib/utils"

const ROWS = generateStore({ endWeek: "2026-10-05" })
const LAST = ROWS.length - 1
const IDS = catalog.map((m) => m.id) as MetricId[]

function Section({ id, n, title, children, lead }: { id: string; n: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border py-14">
      <div className="label-mono mb-3">
        {n} · {title}
      </div>
      {lead && <p className="mb-8 max-w-2xl text-[15px] text-muted-foreground">{lead}</p>}
      {children}
    </section>
  )
}

function Panel({ title, prompt, children, className }: { title: string; prompt?: string; children: React.ReactNode; className?: string }) {
  return (
    <figure className={cn("min-w-0 rounded-lg border border-border bg-card p-5", className)}>
      {prompt && <Prompt command={prompt} className="mb-2" />}
      <figcaption className="mb-4 text-[15px] font-medium text-balance">{title}</figcaption>
      {children}
    </figure>
  )
}

export function Kit() {
  const { resolvedTheme, setTheme } = useTheme()
  const [weekParam, setWeekParam] = useQueryState("week", parseAsString.withDefault(ROWS[LAST]!.week))
  const [metricParam, setMetricParam] = useQueryState("metric", parseAsString.withDefault("revenue"))
  const [open, setOpen] = React.useState(false)

  const found = ROWS.findIndex((r) => r.week === weekParam)
  const index = found >= 60 ? found : LAST
  const metric = (IDS.includes(metricParam as MetricId) ? metricParam : "revenue") as MetricId
  const row = ROWS[index]!
  const prev = ROWS[index - 1]!

  const step = React.useCallback(
    (d: number) => setWeekParam(ROWS[Math.max(60, Math.min(LAST, index + d))]!.week),
    [index, setWeekParam],
  )

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA"].includes(t.tagName))) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === "[") step(-1)
      else if (e.key === "]") step(1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [step])

  const v = React.useMemo(() => verdict(ROWS, index), [index])
  const pulseRows = React.useMemo(() => pulse(ROWS, index, IDS), [index])
  const selectedDef = metricById[metric]
  const selected = pulseRows.find((r) => r.id === metric)!
  const bridge = React.useMemo(() => bridgeSteps(ROWS, index), [index])
  const biggestStep = bridge.slice(1, -1).reduce((a, b) => (Math.abs(b.change) > Math.abs(a.change) ? b : a))
  const tod = React.useMemo(() => timeOfDay(row), [row])
  const todPrev = React.useMemo(() => timeOfDay(prev), [prev])
  const cohortData = React.useMemo(() => cohorts(11, 12, row.week), [row.week])
  const exps = React.useMemo(() => experiments(index), [index])

  // Pacing: quarter to date vs a plan set 15% above the same quarter last year.
  const pacing = React.useMemo(() => {
    const d = new Date(`${row.week}T00:00:00Z`)
    const qStart = Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1)
    const inQ = ROWS.slice(0, index + 1).filter((r) => Date.parse(r.week) >= qStart)
    const sum = (rs: typeof ROWS, f: (r: (typeof ROWS)[number]) => number) => rs.reduce((a, r) => a + f(r), 0)
    const lyStart = qStart - 364 * 864e5
    const lyQ = ROWS.filter((r) => Date.parse(r.week) >= lyStart && Date.parse(r.week) < lyStart + 91 * 864e5)
    const elapsed = Math.min(1, (inQ.length * 7) / 91)
    const plan = (f: (r: (typeof ROWS)[number]) => number) => sum(lyQ, f) * 1.15
    return {
      elapsed,
      data: [
        { name: "Revenue", actual: sum(inQ, (r) => r.values.revenue), plan: plan((r) => r.values.revenue) },
        { name: "Orders", actual: sum(inQ, (r) => r.values.orders), plan: plan((r) => r.values.orders) },
        { name: "New customers", actual: sum(inQ, (r) => r.values.new_customers), plan: plan((r) => r.values.new_customers) },
        { name: "Spend", actual: sum(inQ, (r) => r.values.spend), plan: plan((r) => r.values.spend) },
      ],
    }
  }, [index, row.week])

  const run = (fn: () => void) => {
    fn()
    setOpen(false)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-8">
      <header className="sticky top-0 z-20 -mx-4 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex items-center gap-4">
          <Logo className="text-[18px]" />
          <span className="label-mono hidden sm:inline">Design kit</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="gap-2 font-mono text-xs text-muted-foreground">
            <CommandIcon className="size-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">Command</span>
            <Kbd>⌘K</Kbd>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Toggle theme"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              >
                {resolvedTheme === "dark" ? <Sun className="size-4" strokeWidth={1.5} /> : <Moon className="size-4" strokeWidth={1.5} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Theme <Kbd>D</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* 01 · The Pulse, live ------------------------------------------------ */}
      <section className="py-14">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Prompt command="weekly_read" flags="--sample store --compare wow,4wk,qtr,yoy" />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Previous week" onClick={() => step(-1)} disabled={index <= 60}>
              <ChevronLeft className="size-4" strokeWidth={1.5} />
            </Button>
            <span className="num min-w-[150px] text-center text-[13px]">{formatWeekRange(row.week)}</span>
            <Button variant="ghost" size="icon" aria-label="Next week" onClick={() => step(1)} disabled={index >= LAST}>
              <ChevronRight className="size-4" strokeWidth={1.5} />
            </Button>
          </div>
        </div>
        <Verdict verdict={v} size={46} className="max-w-4xl max-sm:pixel-33" />
        <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
          <PulseTable rows={pulseRows} history={ROWS} index={index} selected={metric} onSelect={(id) => setMetricParam(id)} />
          <div className="min-w-0 xl:sticky xl:top-20 xl:self-start">
            <div className="label-mono">{selectedDef.name}</div>
            <div className="mt-1 flex items-baseline gap-3">
              <MetricValue kind={selectedDef.kind} value={selected.value} className="text-[32px] font-medium" />
              <Delta delta={selected.deltas.wow} kind={selectedDef.kind} size="md" />
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">{selectedDef.definition}</p>
            <TrendChart rows={ROWS} index={index} metric={metric} className="mt-4 h-[260px]" />
            <p className="mt-2 text-[12px] text-muted-foreground">
              Grey band: normal range (trailing 13 weeks, ±2σ). Faint line: last year. <Kbd>J</Kbd> <Kbd>K</Kbd> metric ·{" "}
              <Kbd>[</Kbd> <Kbd>]</Kbd> week
            </p>
          </div>
        </div>
      </section>

      {/* 02 · Type ------------------------------------------------------------ */}
      <Section id="type" n="02" title="Type" lead="One job per font. Pixel states the answer at pixel-true sizes only, Geist is for anything read or clicked, Mono is for every number and label.">
        <div className="space-y-8">
          <div>
            <div className="label-mono mb-2">Geist Pixel · 79 · site hero</div>
            <div className="pixel-79 max-md:pixel-46">Every Monday.</div>
          </div>
          <div>
            <div className="label-mono mb-2">Geist Pixel · 46 · dashboard headline</div>
            <Verdict verdict={v} size={46} as="p" />
          </div>
          <div>
            <div className="label-mono mb-2">Geist Pixel · 33 · mobile headline</div>
            <Verdict verdict={v} size={33} as="p" />
          </div>
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <div className="label-mono mb-2">Geist · 15 / 17 · reading</div>
              <p className="text-[17px] leading-relaxed">
                Conversion rate is orders divided by sessions. A move only matters when it leaves its normal range, which we
                measure against the same comparison over the last 26 weeks.
              </p>
            </div>
            <div>
              <div className="label-mono mb-2">Geist Mono · tabular · numbers</div>
              <div className="num space-y-1 text-[15px]">
                <div>{formatValue({ kind: "currency" }, row.values.revenue, { compact: false })}</div>
                <div>{formatCompact(row.values.sessions)} sessions</div>
                <div>{formatValue({ kind: "rate" }, row.values.conversion_rate)} conversion</div>
                <div>−4.1 pt · +11% · 3.42×</div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* 03 · Color ----------------------------------------------------------- */}
      <Section id="color" n="03" title="Color" lead="Color means direction only. Green ▲ is up and red ▼ is down, always with the arrow. A filled pill means outside normal noise; plain colored text means probably noise.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {[
            ["bg", "bg-background"],
            ["surface", "bg-card"],
            ["ink", "bg-foreground"],
            ["muted", "bg-muted-foreground"],
            ["line", "bg-border"],
            ["brand", "bg-brand"],
            ["band", "bg-band"],
            ["up", "bg-up"],
            ["down", "bg-down"],
            ["up-bg", "bg-up-bg"],
            ["down-bg", "bg-down-bg"],
            ["series 2", "bg-chart-2"],
            ["series 3", "bg-chart-3"],
            ["series 4", "bg-chart-4"],
          ].map(([name, cls]) => (
            <div key={name} className="rounded-md border border-border bg-card p-2">
              <div className={cn("h-10 rounded-[4px] border border-border", cls)} />
              <div className="mt-2 font-mono text-[11px] text-muted-foreground">{name}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          {pulseRows.slice(0, 9).map((r) => (
            <span key={r.id} className="inline-flex items-center gap-2 text-[13px]">
              <span className="text-muted-foreground">{metricById[r.id].short}</span>
              <Delta delta={r.deltas.wow} kind={metricById[r.id].kind} />
            </span>
          ))}
        </div>
      </Section>

      {/* 04 · Charts ---------------------------------------------------------- */}
      <Section id="charts" n="04" title="Charts" lead="Stock Recharts through shadcn charts: built-in tooltips, legends, brush, synced crosshairs and draw-in animation. Lines are ink; green and red appear only where a chart calls out a move.">
        <div className="grid gap-5 md:grid-cols-2">
          <Panel prompt="bridge revenue --wow" title={`${biggestStep.name} moved revenue most this week`} className="md:col-span-2">
            <BridgeChart rows={ROWS} index={index} />
          </Panel>
          <Panel prompt="columns revenue --weeks 13" title="Revenue by week, this week in ink">
            <ColumnsChart rows={ROWS} index={index} metric="revenue" />
          </Panel>
          <Panel prompt="histogram revenue --weeks 104" title="Where this week sits among the last two years">
            <Histogram rows={ROWS} index={index} metric="revenue" />
          </Panel>
          <Panel prompt="funnel --week" title="Where sessions drop out">
            <FunnelStages row={row} prev={prev} />
          </Panel>
          <Panel prompt="share revenue --by channel" title="Revenue by channel">
            <ShareBar row={row} prev={prev} />
          </Panel>
          <Panel prompt="rank revenue --by channel" title="Channels ranked by revenue">
            <RankedBars row={row} />
          </Panel>
          <Panel prompt="pacing --quarter --plan ly+15%" title="Quarter to date against plan">
            <PacingChart data={pacing.data} elapsed={pacing.elapsed} />
          </Panel>
          <Panel prompt="share orders --by device" title="Mobile's share of orders">
            <StackedShare rows={ROWS} index={index} />
          </Panel>
          <Panel prompt="bubble channels --x conv --y aov --size revenue" title="Channels by conversion and order value">
            <BubbleChart row={row} />
          </Panel>
          <Panel prompt="slope conversion --by channel --yoy" title="Channel conversion against the same week last year">
            <SlopeChart rows={ROWS} index={index} />
          </Panel>
          <Panel prompt="experiments --ci 95" title="Recent experiments: filled when the interval clears zero">
            <IntervalsChart data={exps} />
          </Panel>
          <Panel prompt="multiples sessions --by channel --index 100" title="Sessions by channel, indexed to 26 weeks ago" className="md:col-span-2">
            <SmallMultiples rows={ROWS} index={index} />
          </Panel>
          <Panel prompt="radar orders --by hour" title="When orders happen, this week and last">
            <TimeOfDayRadar current={tod} previous={todPrev} />
          </Panel>
          <Panel prompt="heatmap orders --by weekday,hour" title="Orders by weekday and time of day">
            <Heatmap cells={tod} />
          </Panel>
          <Panel prompt="cohorts --monthly --repeat" title="Share of each month's new customers who ordered again" className="md:col-span-2">
            <CohortGrid data={cohortData} />
          </Panel>
        </div>
      </Section>

      {/* 05 · Marks ---------------------------------------------------------- */}
      <Section id="marks" n="05" title="Pixel marks" lead="One 9×9 ink pictogram per library category, drawn on whole screen pixels at 18, 27, 36 or 72px.">
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-5">
          {(Object.keys(pixelMarks) as PixelMarkName[]).map((name) => (
            <div key={name} className="flex items-center gap-3">
              <PixelMark name={name} size={36} />
              <span className="text-[13px]">{pixelMarkNames[name]}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 06 · Motion --------------------------------------------------------- */}
      <Section id="motion" n="06" title="Motion" lead="Nothing moves unless a number changed. Step through weeks with [ and ] to see digits swap and charts glide.">
        <table className="w-full max-w-xl text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th className="label-mono py-2 text-left font-medium">Token</th>
              <th className="label-mono py-2 text-right font-medium">Duration</th>
              <th className="label-mono py-2 pl-6 text-left font-medium">Used for</th>
            </tr>
          </thead>
          <tbody className="num">
            {[
              ["micro", "80ms", "hover off, menu exit"],
              ["short", "160ms", "digit swap, menus, toasts out"],
              ["medium", "240ms", "tabs, sheets, chart morph"],
              ["long", "400ms", "stepped chart reveal, ceiling"],
            ].map(([a, b, c]) => (
              <tr key={a} className="border-b border-border">
                <td className="py-2">{a}</td>
                <td className="py-2 text-right">{b}</td>
                <td className="py-2 pl-6 font-sans text-muted-foreground">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <footer className="border-t border-border py-10 font-mono text-xs text-muted-foreground">
        Sample store, seeded data. Comparisons: {Object.values(comparisonLabels).map((c) => c.long).join(" · ")}.
      </footer>

      <CommandDialog open={open} onOpenChange={setOpen} title="Command line" description="Type a command">
        <CommandInput placeholder="> type a command…" className="font-mono" />
        <CommandList>
          <CommandEmpty>No command found.</CommandEmpty>
          <CommandGroup heading="Week">
            <CommandItem onSelect={() => run(() => step(-1))} className="font-mono">
              week --prev<CommandShortcut>[</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => step(1))} className="font-mono">
              week --next<CommandShortcut>]</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => setWeekParam(ROWS[LAST]!.week))} className="font-mono">
              week --latest
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Metric">
            {catalog.map((m) => (
              <CommandItem key={m.id} value={`metric ${m.id} ${m.name}`} onSelect={() => run(() => setMetricParam(m.id))} className="font-mono">
                metric {m.id}
                <span className="ml-auto font-sans text-muted-foreground">{m.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="View">
            <CommandItem onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))} className="font-mono">
              theme --toggle<CommandShortcut>D</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  )
}
