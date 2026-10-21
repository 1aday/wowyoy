import { bandAtVolumes, volumeToDetect, type BandRow, type MetricSpec } from "@workspace/metrics"
import { formatAmount, formatMove } from "./format"

export interface BandTableRow extends BandRow {
  /** "800 checkouts started a week" */
  volumeLabel: string
  /** "±1.9 pt" for rates, "±10%" for everything else */
  moveLabel: string
}

/** The Standard's band table: what a week-over-week move must exceed to count, at four volumes. */
export function bandTable(spec: MetricSpec): BandTableRow[] {
  return bandAtVolumes(spec.noise, spec.noise.reference_volumes).map((r) => ({
    ...r,
    volumeLabel: `${r.volume.toLocaleString("en-US")} ${spec.noise.volume_unit}`,
    moveLabel: formatMove(spec, r),
  }))
}

/** For the volume slider: the band at any volume, plus the volume needed to see a 5% move. */
export function bandAt(spec: MetricSpec, volume: number): BandTableRow | null {
  const [r] = bandAtVolumes(spec.noise, [volume])
  if (!r) return null
  return { ...r, volumeLabel: `${volume.toLocaleString("en-US")} ${spec.noise.volume_unit}`, moveLabel: formatMove(spec, r) }
}

export function volumeFor(spec: MetricSpec, relativeMove: number) {
  return volumeToDetect(spec.noise, relativeMove)
}

export { formatAmount }
