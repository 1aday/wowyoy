import { DOWN, UP, formatChange, type Delta as DeltaData, type MetricKind } from "@workspace/metrics"
import { cn } from "@workspace/ui/lib/utils"

/**
 * The only way a change is ever shown. Color means direction (green ▲, red ▼).
 * A filled, bold pill means the move is outside normal noise; plain colored text means probably noise.
 */
export function Delta({
  delta,
  kind,
  className,
  size = "sm",
}: {
  delta: DeltaData | null
  kind: MetricKind
  className?: string
  size?: "sm" | "md"
}) {
  if (!delta) return <span className={cn("num text-muted-foreground", className)}>—</span>
  const text0 = formatChange(kind, delta.change)
  // A change that rounds to zero reads as flat, whatever its sign.
  const dir = /^[+\u2212]0(\.0+)?( pt|%)$/.test(text0) ? "flat" : delta.direction
  const glyph = dir === "up" ? UP : dir === "down" ? DOWN : "●"
  const text = text0
  const label = `${dir === "flat" ? "flat" : dir} ${text}${delta.significant ? ", outside normal range" : ", within normal range"}`
  return (
    <span
      aria-label={label}
      title={delta.significant ? "Outside normal noise (beyond ±2σ of recent weeks)" : "Within normal noise"}
      className={cn(
        "num inline-flex items-center gap-[0.35em] whitespace-nowrap rounded-full leading-none",
        size === "sm" ? "text-[13px]" : "text-[15px]",
        dir === "up" && "text-up",
        dir === "down" && "text-down",
        dir === "flat" && "text-muted-foreground",
        delta.significant && dir !== "flat" && "px-2 py-[3px] font-semibold",
        delta.significant && dir === "up" && "bg-up-bg",
        delta.significant && dir === "down" && "bg-down-bg",
        !delta.significant && "px-2 py-[3px]",
        className,
      )}
    >
      <span className="text-[0.72em]" aria-hidden>
        {glyph}
      </span>
      {text.replace(/^[+−]/, "")}
    </span>
  )
}
