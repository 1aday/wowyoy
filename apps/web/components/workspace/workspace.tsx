"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs"
import { Command as CommandIcon } from "lucide-react"
import { catalog, formatWeekRange, type MetricId, type MetricWeek } from "@workspace/metrics"
import type { DiscoveredEvent, Mapping } from "@workspace/sources"
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
import { Logo } from "@workspace/ui/brand/logo"
import { cn } from "@workspace/ui/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { PulseView } from "./pulse-view"
import { YearView } from "./year-view"
import { MappingView } from "./mapping-view"

export type Source =
  | { kind: "sample"; name: string }
  | { kind: "posthog"; name: string; projectId: string; host: string; mappedBy: "claude" | "rules"; connectedAt: string }

const views = ["pulse", "year", "mapping"] as const
export type View = (typeof views)[number]
const viewNames: Record<View, string> = { pulse: "Pulse", year: "Year in Mondays", mapping: "Mapping" }
const shortNames: Record<View, string> = { pulse: "Pulse", year: "Year", mapping: "Mapping" }

export interface WorkspaceProps {
  source: Source
  rows: MetricWeek[]
  mapping: Mapping
  events?: DiscoveredEvent[]
}

export function Workspace({ source, rows, mapping, events }: WorkspaceProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const router = useRouter()
  const [view, setView] = useQueryState("view", parseAsStringLiteral(views).withDefault("pulse"))
  const [weekParam, setWeekParam] = useQueryState("week", parseAsString)
  const [metricParam, setMetricParam] = useQueryState("metric", parseAsString)
  const [open, setOpen] = React.useState(false)

  const last = rows.length - 1
  const found = weekParam ? rows.findIndex((r) => r.week === weekParam) : -1
  const index = found >= 1 ? found : last
  const ids = React.useMemo(() => catalog.map((m) => m.id).filter((id) => rows[last]?.values[id] != null) as MetricId[], [rows, last])
  const lead: MetricId = ids.includes("revenue") ? "revenue" : ids.includes("orders") ? "orders" : (ids[0] ?? "sessions")
  const metric = (metricParam && ids.includes(metricParam as MetricId) ? metricParam : lead) as MetricId

  const goWeek = React.useCallback((i: number) => setWeekParam(i >= last ? null : rows[Math.max(1, Math.min(last, i))]!.week), [rows, last, setWeekParam])
  const step = React.useCallback((d: number) => goWeek(index + d), [goWeek, index])
  const selectMetric = React.useCallback((id: MetricId) => setMetricParam(id === lead ? null : id), [lead, setMetricParam])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === "[") step(-1)
      else if (e.key === "]") step(1)
      else if (e.key === "1" || e.key === "2" || e.key === "3") setView(views[Number(e.key) - 1]!)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [step, setView])

  const run = (fn: () => void) => {
    fn()
    setOpen(false)
  }

  if (rows.length < 2) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <Logo />
        <p className="mt-6 text-muted-foreground">Not enough weeks of data yet. Come back after your second full week.</p>
      </div>
    )
  }

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-stretch gap-3 px-4 sm:gap-6 sm:px-8">
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/" aria-label="wowyoy home">
              <Logo className="text-[18px]" cursor={false} />
            </Link>
            <span className="h-5 w-px bg-border max-sm:hidden" aria-hidden />
            <div className="flex min-w-0 flex-col leading-tight max-sm:hidden">
              <span className="max-w-[180px] truncate text-[13px] font-medium">{source.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {source.kind === "sample" ? "sample data" : `posthog · ${source.projectId}`}
              </span>
            </div>
          </div>
          <nav className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto [scrollbar-width:none]" aria-label="Views">
            {views.map((v, k) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-current={view === v ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-2 px-2 text-[13.5px] sm:px-2.5 font-medium whitespace-nowrap text-muted-foreground transition-colors duration-[80ms] hover:text-foreground",
                  view === v && "text-foreground after:absolute after:inset-x-2 after:bottom-0 sm:after:inset-x-2.5 after:h-0.5 after:bg-foreground",
                )}
              >
                <span className="sm:hidden" aria-hidden>
                  {shortNames[v]}
                </span>
                <span className="max-sm:sr-only">{viewNames[v]}</span>
                <Kbd className="max-md:hidden">{k + 1}</Kbd>
              </button>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground max-lg:hidden">
              <Link href="/fluke">Fluke Test</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="gap-2 font-mono text-xs text-muted-foreground max-sm:hidden" aria-label="Open command line">
              <CommandIcon className="size-4" strokeWidth={1.5} />
              <Kbd>⌘K</Kbd>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {source.kind === "sample" && (
        <div className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-8">
            <p className="text-[13px] text-muted-foreground">
              <span className="font-medium text-foreground">Sample workspace.</span> A DTC store on seeded data, read the way yours will be.
            </p>
            <Button asChild size="sm">
              <Link href="/connect">Connect your PostHog</Link>
            </Button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-8">
        {view === "pulse" && (
          <PulseView rows={rows} index={index} ids={ids} metric={metric} onMetric={selectMetric} onStep={step} />
        )}
        {view === "year" && (
          <YearView
            rows={rows}
            index={index}
            lead={lead}
            onWeek={goWeek}
            onOpen={(i) => {
              goWeek(i)
              setView("pulse")
            }}
          />
        )}
        {view === "mapping" && <MappingView source={source} mapping={mapping} events={events} rows={rows} />}
      </main>

      <CommandDialog open={open} onOpenChange={setOpen} title="Command line" description="Type a command">
        <CommandInput placeholder="> type a command…" className="font-mono" />
        <CommandList>
          <CommandEmpty>No command found.</CommandEmpty>
          <CommandGroup heading="View">
            {views.map((v, k) => (
              <CommandItem key={v} onSelect={() => run(() => setView(v))} className="font-mono">
                view {v}
                <span className="ml-auto font-sans text-muted-foreground">{viewNames[v]}</span>
                <CommandShortcut>{k + 1}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Week">
            <CommandItem onSelect={() => run(() => step(-1))} className="font-mono">
              week --prev<CommandShortcut>[</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => step(1))} className="font-mono">
              week --next<CommandShortcut>]</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => goWeek(last))} className="font-mono">
              week --latest
              <span className="ml-auto font-sans text-muted-foreground">{formatWeekRange(rows[last]!.week)}</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Metric">
            {ids.map((id) => {
              const m = catalog.find((c) => c.id === id)!
              return (
                <CommandItem
                  key={id}
                  value={`metric ${id} ${m.name}`}
                  onSelect={() =>
                    run(() => {
                      selectMetric(id)
                      setView("pulse")
                    })
                  }
                  className="font-mono"
                >
                  metric {id}
                  <span className="ml-auto font-sans text-muted-foreground">{m.name}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
          <CommandGroup heading="Go">
            <CommandItem onSelect={() => run(() => router.push("/fluke"))} className="font-mono">
              open fluke_test
              <span className="ml-auto font-sans text-muted-foreground">Is this a fluke?</span>
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))} className="font-mono">
              theme --toggle<CommandShortcut>D</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  )
}
