"use client"

import NumberFlow from "@number-flow/react"
import { valueParts, type MetricKind } from "@workspace/metrics"
import { cn } from "@workspace/ui/lib/utils"

/** A metric value that swaps only the digits that changed (160ms, stepped). */
export function MetricValue({ kind, value, className }: { kind: MetricKind; value: number; className?: string }) {
  const p = valueParts({ kind }, value)
  return (
    <NumberFlow
      className={cn("num", className)}
      value={p.value}
      prefix={p.prefix}
      suffix={p.suffix}
      format={{ minimumFractionDigits: p.fraction, maximumFractionDigits: p.fraction, useGrouping: true }}
      transformTiming={{ duration: 160, easing: "steps(4, end)" }}
      spinTiming={{ duration: 160, easing: "steps(4, end)" }}
      opacityTiming={{ duration: 80, easing: "linear" }}
      willChange
    />
  )
}
