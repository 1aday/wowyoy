import type { Metadata } from "next"
import { Suspense } from "react"
import { Workspace } from "@/components/workspace/workspace"
import { sampleEvents, sampleMapping, sampleRows } from "@/lib/sample"

/** The sample ends at last week, so rebuild it hourly rather than freezing it at deploy time. */
export const revalidate = 3600

export const metadata: Metadata = {
  title: "Sample workspace",
  description: "The weekly Pulse, a Year in Mondays and the event mapping for a sample DTC store.",
}

export default function DemoPage() {
  return (
    <Suspense>
      <Workspace source={{ kind: "sample", name: "Northwind Goods" }} rows={sampleRows()} mapping={sampleMapping} events={sampleEvents} />
    </Suspense>
  )
}
