import type { MetricSpec } from "@workspace/metrics"
import type { WhyDirection } from "@workspace/compiler"

/**
 * The Fluke Test, embedded on a Standard or Why page and pre-filled for one metric.
 * Placeholder until the Fluke Test build replaces it; the props are the contract.
 */
export interface FlukeEmbedProps {
  spec: Pick<MetricSpec, "id" | "name" | "kind" | "noise" | "example" | "polarity">
  /** On a Why page: pre-fill a move in this direction. */
  direction?: WhyDirection
  className?: string
}

export function FlukeEmbed(_props: FlukeEmbedProps) {
  return null
}
