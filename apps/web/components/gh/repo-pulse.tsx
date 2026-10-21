"use client"

import * as React from "react"
import { formatWeekRange } from "@workspace/metrics"
import { isRepoMeasure, type RepoMeasure } from "@workspace/feeds/github/types"
import { Prompt } from "@workspace/ui/brand/prompt"
import { cn } from "@workspace/ui/lib/utils"
import type { MeasureView, RepoView } from "@/lib/gh/view"
import { RepoChart } from "./repo-chart"
import { RepoMove, callNames } from "./repo-move"
import { RepoTable } from "./repo-table"

/** The measure to open on: the biggest real move, else stars, else the first with history. */
function firstPick(view: RepoView): RepoMeasure {
  const i = view.closed - 1
  const real = view.measures
    .filter((m) => m.calls[i]?.call === "real")
    .sort((a, b) => Math.abs(b.calls[i]!.relativeChange) - Math.abs(a.calls[i]!.relativeChange))
  return real[0]?.id ?? view.measures.find((m) => m.status !== "unavailable")?.id ?? "stars"
}

/** The chart's title states the finding for the latest closed week. */
function finding(m: MeasureView, closed: number) {
  const call = m.calls[closed - 1]
  if (m.status === "unavailable") return `No ${m.label} history`
  if (!call) return `${m.name}: one more week before there's a call`
  if (call.call === "real") return `${m.name} moved beyond noise last week`
  if (call.call === "edge") return `${m.name} are on the edge of noise`
  if (call.call === "too-few") return `Too few ${m.label} a week to judge`
  return `${m.name} stayed within noise last week`
}

/** Repo Pulse: the week table, the selected measure's chart, and its weeks one by one. J / K move the selection. */
export function RepoPulseView({ view }: { view: RepoView }) {
  const [selected, setSelected] = React.useState<RepoMeasure>(() => firstPick(view))
  const ids = view.measures.map((m) => m.id)

  React.useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("m")
    if (isRepoMeasure(m)) setSelected(m)
  }, [])

  const select = React.useCallback((id: RepoMeasure) => {
    setSelected(id)
    const url = new URL(window.location.href)
    url.searchParams.set("m", id)
    window.history.replaceState(null, "", url)
  }, [])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const at = ids.indexOf(selected)
      if (e.key === "j" || e.key === "J") select(ids[Math.min(ids.length - 1, at + 1)]!)
      if (e.key === "k" || e.key === "K") select(ids[Math.max(0, at - 1)]!)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [ids, selected, select])

  const measure = view.measures.find((m) => m.id === selected) ?? view.measures[0]!
  const latest = view.weeks[view.closed - 1]!
  const repo = view.fullName.toLowerCase()

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Prompt command="weekly_read" flags={`--repo ${repo} --compare wow`} className="min-w-0 truncate" />
          <span className="font-mono text-[12px] text-muted-foreground">
            {latest.id} · {formatWeekRange(latest.monday)}
          </span>
        </div>
        <RepoTable view={view} selected={selected} onSelect={select} />
        {view.measures.some((m) => m.note) && (
          <ul className="mt-4 grid gap-1 text-[12.5px] leading-relaxed text-muted-foreground" data-testid="measure-notes">
            {view.measures
              .filter((m) => m.note)
              .map((m) => (
                <li key={m.id}>
                  <span className="text-foreground">{m.name}:</span> {m.note}
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="grid min-w-0 gap-6 rounded-xl border border-border bg-card p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px]" aria-label={`${measure.name} by week`}>
        <div className="min-w-0">
          <Prompt command="trend" flags={`--measure ${measure.id} --weeks 26`} className="mb-3 truncate" />
          <h2 className="text-[17px] font-medium text-balance" data-testid="chart-title">
            {finding(measure, view.closed)}
          </h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
            {measure.description} Grey band: the 13 weeks before, mean ±2σ.
          </p>
          {measure.status === "unavailable" && measure.note && (
            <p className="mt-5 border-l-2 border-foreground pl-3 text-[14px] leading-relaxed">{measure.note}</p>
          )}
          {measure.status === "unavailable" ? null : <RepoChart view={view} measure={measure} className="mt-5" />}
        </div>
        <WeekList view={view} measure={measure} />
      </section>
    </div>
  )
}

function WeekList({ view, measure }: { view: RepoView; measure: MeasureView }) {
  const [all, setAll] = React.useState(false)
  const closed = view.weeks
    .slice(0, view.closed)
    .map((w, i) => ({ w, i }))
    .filter(({ i }) => measure.counts[i] != null)
    .reverse()
  const shown = all ? closed : closed.slice(0, 8)
  const open = view.weeks.slice(view.closed).map((w, k) => ({ w, i: view.closed + k }))
  const short = (monday: string) => formatWeekRange(monday).replace(/, \d{4}$/, "")

  return (
    <div className="min-w-0">
      <div className="label-mono mb-2">Week by week</div>
      {measure.status === "unavailable" ? (
        <p className="text-[13.5px] text-muted-foreground">Nothing to list.</p>
      ) : (
        <ol className="divide-y divide-border border-y border-border" data-testid="week-list">
          {open.reverse().map(({ w, i }) => (
            <li key={w.id} className="flex h-10 items-center gap-3 text-[13px]">
              <span className="min-w-0 flex-1 truncate">
                <span className="text-foreground">{short(w.monday)}</span>{" "}
                <span className="font-mono text-[11px] text-muted-foreground">so far</span>
              </span>
              <span className="num w-14 text-right text-muted-foreground">{measure.counts[i]?.toLocaleString("en-US") ?? "—"}</span>
              <span className="w-[92px] text-right font-mono text-[11px] text-muted-foreground">open</span>
            </li>
          ))}
          {shown.map(({ w, i }) => {
            const call = measure.calls[i] ?? null
            return (
              <li key={w.id} className="flex h-10 items-center gap-3 text-[13px]" title={call ? `${callNames[call.call]}. ${call.reason}` : undefined}>
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-foreground">{short(w.monday)}</span> <span className="font-mono text-[11px] text-muted-foreground">{w.id.slice(5)}</span>
                </span>
                <span className="num w-14 text-right">{measure.counts[i]!.toLocaleString("en-US")}</span>
                <span className="flex w-[92px] justify-end">
                  <RepoMove call={call} />
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {closed.length > 8 && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className={cn("mt-3 font-mono text-[12px] text-muted-foreground transition-colors duration-[80ms] hover:text-foreground")}
        >
          {all ? "Latest 8 weeks" : `All ${closed.length} weeks`}
        </button>
      )}
    </div>
  )
}
