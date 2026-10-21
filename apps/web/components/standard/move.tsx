import { DOWN, UP, formatChange, type MetricSpec } from "@workspace/metrics"
import { cn } from "@workspace/ui/lib/utils"

/**
 * A week-over-week change. Colour is direction only: green ▲, red ▼.
 * Outside normal noise it is a filled, bold pill; inside, plain coloured text.
 * `change` is in points (a fraction) for rates and relative for everything else.
 */
export function Move({
  kind,
  change,
  real,
  className,
}: {
  kind: MetricSpec["kind"]
  change: number
  real: boolean
  className?: string
}) {
  const text = formatChange(kind === "duration" ? "count" : kind, change)
  const flat = /^[+−]0(\.0+)?( pt|%)$/.test(text)
  const dir = flat ? "flat" : change > 0 ? "up" : "down"
  return (
    <span
      aria-label={`${dir === "flat" ? "flat" : dir} ${text}, ${real ? "outside normal noise" : "within normal noise"}`}
      className={cn(
        "num inline-flex items-center gap-[0.35em] rounded-full leading-none whitespace-nowrap",
        dir === "up" && "text-up",
        dir === "down" && "text-down",
        dir === "flat" && "text-muted-foreground",
        real && dir !== "flat" ? "px-[0.6em] py-[0.32em] font-semibold" : "",
        real && dir === "up" && "bg-up-bg",
        real && dir === "down" && "bg-down-bg",
        className,
      )}
    >
      <span className="text-[0.72em]" aria-hidden>
        {dir === "up" ? UP : dir === "down" ? DOWN : "●"}
      </span>
      <span aria-hidden>{text.replace(/^[+−]/, "")}</span>
    </span>
  )
}
