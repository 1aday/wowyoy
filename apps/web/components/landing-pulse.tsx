"use client"

import * as React from "react"
import { catalog, pulse, type MetricId, type MetricWeek } from "@workspace/metrics"
import { PulseTable } from "@workspace/ui/brand/pulse-table"

/** The real Pulse table on sample data, so the landing page shows the product rather than a picture of it. */
export function LandingPulse({ rows }: { rows: MetricWeek[] }) {
  const index = rows.length - 1
  const [selected, setSelected] = React.useState<MetricId>("revenue")
  const data = React.useMemo(() => pulse(rows, index, catalog.map((m) => m.id)), [rows, index])
  return <PulseTable rows={data} history={rows} index={index} selected={selected} onSelect={setSelected} />
}
