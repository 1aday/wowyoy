import { bandAt, bandTable, formatAmount, volumeFor } from "@workspace/compiler"
import type { MetricSpec } from "@workspace/metrics"
import type { BandModel } from "./band-math"

/** The slider's model, from the compiler's band. Server only: it reads the compiler. */
export function bandModel(spec: MetricSpec): BandModel | null {
  const one = bandAt(spec, 1)
  if (!one) return null
  const rate = spec.kind === "rate"
  return {
    kind: spec.kind,
    unit: spec.noise.volume_unit,
    typical: spec.noise.typical,
    abs1: one.absolute,
    min: spec.noise.min_denominator,
    references: bandTable(spec).map((r) => ({
      volume: r.volume,
      move: r.moveLabel,
      relative: r.relative,
      alt: rate ? `±${(r.relative * 100).toFixed(r.relative < 0.1 ? 1 : 0)}%` : `±${formatAmount(spec, r.absolute)}`,
    })),
    altLabel: rate ? "Relative" : `On ${formatAmount(spec, spec.noise.typical)}`,
    detect5: volumeFor(spec, 0.05),
  }
}
