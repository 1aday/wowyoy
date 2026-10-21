"use client"

import { formatCompact } from "@workspace/metrics"
import type { RepoMeasure } from "@workspace/feeds/github/types"
import { Sparkline } from "@workspace/ui/brand/chart-kit"
import { cn } from "@workspace/ui/lib/utils"
import type { MeasureView, RepoView } from "@/lib/gh/view"
import { RepoMove, callNames } from "./repo-move"

const count = (n: number | null | undefined) => (n == null ? "—" : n < 10000 ? n.toLocaleString("en-US") : formatCompact(n))

/**
 * The repo's week, one row per measure, in the Pulse table's visual language: uppercase mono headers,
 * last week's count, the move against the week before and the call. A row selects the chart below.
 */
export function RepoTable({
  view,
  selected,
  onSelect,
  className,
}: {
  view: RepoView
  selected: RepoMeasure
  onSelect: (id: RepoMeasure) => void
  className?: string
}) {
  const i = view.closed - 1
  const open = view.weeks.length > view.closed ? view.weeks.length - 1 : null
  const spark = (m: MeasureView) =>
    view.weeks.slice(0, view.closed).flatMap((w, k) => (m.counts[k] == null ? [] : [{ week: w.monday, value: m.counts[k]! }]))

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full border-collapse" aria-label="Repo Pulse">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="label-mono h-9 px-2 pl-7 text-left font-medium whitespace-nowrap">
              Measure
            </th>
            <th scope="col" className="label-mono h-9 px-2 text-left font-medium whitespace-nowrap max-md:hidden">
              26 wk
            </th>
            <th scope="col" className="label-mono h-9 px-2 text-right font-medium whitespace-nowrap">
              Last wk
            </th>
            <th scope="col" className="label-mono h-9 px-2 text-right font-medium whitespace-nowrap">
              WoW
            </th>
            <th scope="col" className="label-mono h-9 px-2 text-left font-medium whitespace-nowrap max-sm:hidden">
              Call
            </th>
            {open != null && (
              <th scope="col" className="label-mono h-9 px-2 pr-3 text-right font-medium whitespace-nowrap max-md:hidden">
                So far
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {view.measures.map((m) => {
            const isSel = m.id === selected
            const call = m.calls[i] ?? null
            const missing = m.status === "unavailable"
            return (
              <tr
                key={m.id}
                aria-selected={isSel}
                data-measure={m.id}
                onClick={() => onSelect(m.id)}
                className={cn("group cursor-default border-b border-border transition-colors duration-[80ms] hover:bg-accent", isSel && "bg-accent")}
              >
                <td className="relative h-11 px-2 pl-7 whitespace-nowrap">
                  <span aria-hidden className={cn("num absolute left-2 text-up", isSel ? "opacity-100" : "opacity-0")}>
                    &gt;
                  </span>
                  <button type="button" className="text-left text-[14px] text-foreground outline-none" onClick={() => onSelect(m.id)}>
                    {m.name}
                  </button>
                  {m.status === "partial" && (
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground" title={m.note ?? undefined}>
                      partial
                    </span>
                  )}
                </td>
                <td className="h-11 px-2 max-md:hidden">{missing ? null : <Sparkline values={spark(m)} kind="count" />}</td>
                <td className="num h-11 px-2 text-right text-[14px] font-medium whitespace-nowrap">{missing ? <span className="text-muted-foreground">—</span> : count(m.counts[i])}</td>
                <td className="h-11 px-2 text-right whitespace-nowrap">
                  <RepoMove call={call} />
                </td>
                <td className="h-11 px-2 text-[13px] whitespace-nowrap max-sm:hidden">
                  {missing ? (
                    <span className="text-muted-foreground" title={m.note ?? undefined}>
                      No history
                    </span>
                  ) : call ? (
                    <span className={cn(call.call === "real" ? "font-medium text-foreground" : "text-muted-foreground")}>{callNames[call.call]}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                {open != null && (
                  <td className="num h-11 px-2 pr-3 text-right text-[13px] whitespace-nowrap text-muted-foreground max-md:hidden">
                    {missing ? "—" : count(m.counts[open])}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
