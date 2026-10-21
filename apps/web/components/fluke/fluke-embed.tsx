import type { MetricSpec } from "@workspace/metrics"
import type { WhyDirection } from "@workspace/compiler"
import { embedPrefill } from "@/lib/fluke/embed"
import { FlukeEmbedCard } from "./fluke-embed-card"

/**
 * The Fluke Test, embedded on a Standard or Why page and pre-filled for one metric.
 * Metrics with a sampling floor get the two-number test; process metrics get their example history.
 */
export interface FlukeEmbedProps {
  spec: Pick<MetricSpec, "id" | "name" | "kind" | "noise" | "example" | "polarity">
  /** On a Why page: pre-fill a move in this direction. */
  direction?: WhyDirection
  className?: string
}

export function FlukeEmbed({ spec, direction, className }: FlukeEmbedProps) {
  const prefill = embedPrefill(spec, direction)
  return (
    <FlukeEmbedCard
      spec={{ id: spec.id, name: spec.name, kind: spec.kind, example: spec.example }}
      prefill={prefill}
      direction={direction}
      className={className}
    />
  )
}
