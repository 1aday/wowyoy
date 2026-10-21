"use client"

import * as React from "react"
import {
  createColumnHelper,
  rowSelectionFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import {
  comparisonLabels,
  comparisons,
  metricById,
  type Comparison,
  type MetricId,
  type PulseRow,
  type MetricWeek,
} from "@workspace/metrics"
import { cn } from "@workspace/ui/lib/utils"
import { Delta } from "./delta"
import { MetricValue } from "./metric-value"
import { Sparkline } from "./chart-kit"

const features = tableFeatures({ rowSelectionFeature })
const helper = createColumnHelper<typeof features, PulseRow>()

/**
 * The Weekly Growth Pulse table: one row per metric in funnel order, this week's value,
 * then the change against last week, the trailing 4 weeks, the quarter and last year.
 * A row is one object: selecting it drives the chart beside it. J / K move the selection.
 */
export function PulseTable({
  rows,
  history,
  index,
  selected,
  onSelect,
  className,
}: {
  rows: PulseRow[]
  history: readonly MetricWeek[]
  index: number
  selected: MetricId
  onSelect: (id: MetricId) => void
  className?: string
}) {
  const columns = React.useMemo(
    () =>
      helper.columns([
        helper.accessor("id", {
          id: "metric",
          header: "Metric",
          cell: (info) => {
            const def = metricById[info.getValue()]
            return (
              <span className="text-[14px] text-foreground">
                <span className="max-sm:hidden">{def.name}</span>
                <span className="sm:hidden">{def.short}</span>
              </span>
            )
          },
        }),
        helper.display({
          id: "trend",
          header: "26 wk",
          cell: (info) => {
            const id = info.row.original.id
            const values = history
              .slice(Math.max(0, index - 25), index + 1)
              .flatMap((r) => (r.values[id] == null ? [] : [{ week: r.week, value: r.values[id]! }]))
            return <Sparkline values={values} kind={metricById[id].kind} />
          },
        }),
        helper.accessor("value", {
          header: "This week",
          cell: (info) => (
            <MetricValue kind={metricById[info.row.original.id].kind} value={info.getValue()} className="text-[14px] font-medium" />
          ),
        }),
        ...comparisons.map((c: Comparison) =>
          helper.display({
            id: c,
            header: comparisonLabels[c].short,
            cell: (info) => <Delta delta={info.row.original.deltas[c]} kind={metricById[info.row.original.id].kind} />,
          }),
        ),
      ]),
    [history, index],
  )

  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId: (r) => r.id,
    enableMultiRowSelection: false,
    state: { rowSelection: { [selected]: true } },
    onRowSelectionChange: () => {},
  })

  const ids = rows.map((r) => r.id)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const at = ids.indexOf(selected)
      if (e.key === "j" || e.key === "J") onSelect(ids[Math.min(ids.length - 1, at + 1)]!)
      if (e.key === "k" || e.key === "K") onSelect(ids[Math.max(0, at - 1)]!)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [ids, selected, onSelect])

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full border-collapse" aria-label="Weekly Growth Pulse">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id} className="border-b border-border">
              {group.headers.map((header, k) => (
                <th
                  key={header.id}
                  scope="col"
                  className={cn("label-mono h-9 px-2 font-medium whitespace-nowrap", k === 0 ? "pl-7 text-left" : k === 1 ? "text-left max-md:hidden" : "text-right")}
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, r) => {
            const isSel = row.original.id === selected
            const stage = metricById[row.original.id].stage
            const prevStage = r > 0 ? metricById[rows[r - 1]!.id].stage : stage
            return (
              <tr
                key={row.id}
                aria-selected={isSel}
                onClick={() => onSelect(row.original.id)}
                className={cn(
                  "group cursor-default border-b border-border transition-colors duration-[80ms] hover:bg-accent",
                  stage !== prevStage && "border-t border-t-foreground/15",
                  isSel && "bg-accent",
                )}
              >
                {row.getAllCells().map((cell, k) => (
                  <td key={cell.id} className={cn("h-11 px-2 whitespace-nowrap", k === 0 ? "relative pl-7" : k === 1 ? "max-md:hidden" : "text-right")}>
                    {k === 0 && (
                      <span aria-hidden className={cn("num absolute left-2 text-up", isSel ? "opacity-100" : "opacity-0")}>
                        &gt;
                      </span>
                    )}
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
