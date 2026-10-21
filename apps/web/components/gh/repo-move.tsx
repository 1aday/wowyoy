import { DOWN, UP } from "@workspace/metrics"
import { directionOf, percentText, type HeadlinePart } from "@workspace/feeds/github/read"
import { cn } from "@workspace/ui/lib/utils"
import type { CallView } from "@/lib/gh/view"

export const callNames = { real: "Real move", edge: "On the edge", noise: "Noise", "too-few": "Too few" } as const

/**
 * A week-over-week move in the Delta's visual language: green ▲ / red ▼, a filled bold pill when the
 * move is real, plain coloured text when it's noise, grey when there are too few to judge.
 */
export function RepoMove({ call, size = "sm", className }: { call: CallView | null; size?: "sm" | "md"; className?: string }) {
  if (!call) return <span className={cn("num text-[13px] text-muted-foreground", className)}>—</span>
  const dir = directionOf(call)
  const real = call.call === "real" && dir !== "flat"
  const muted = call.call === "too-few" || dir === "flat"
  const amount = call.before === 0 ? Math.abs(call.after).toLocaleString("en-US") : percentText(call.relativeChange)
  const glyph = dir === "up" ? UP : dir === "down" ? DOWN : "●"
  return (
    <span
      aria-label={`${dir === "flat" ? "flat" : dir} ${amount}, ${callNames[call.call].toLowerCase()}`}
      title={call.reason}
      className={cn(
        "num inline-flex items-center gap-[0.35em] rounded-full px-2 py-[3px] leading-none whitespace-nowrap",
        size === "sm" ? "text-[13px]" : "text-[15px]",
        muted ? "text-muted-foreground" : dir === "up" ? "text-up" : "text-down",
        real && "font-semibold",
        real && (dir === "up" ? "bg-up-bg" : "bg-down-bg"),
        className,
      )}
    >
      <span className="text-[0.72em]" aria-hidden>
        {glyph}
      </span>
      {amount}
    </span>
  )
}

/** The answer in Geist Pixel, coloured only at the move. */
export function RepoHeadline({ parts, className }: { parts: readonly HeadlinePart[]; className?: string }) {
  return (
    <h1 className={cn("pixel-46 text-balance text-foreground max-sm:pixel-33", className)} data-testid="repo-headline">
      {parts.map((p, i) => (
        <span key={i} className={cn(p.tone === "up" && "text-up", p.tone === "down" && "text-down")}>
          {p.text}
        </span>
      ))}
      <span className="cursor-block" aria-hidden />
    </h1>
  )
}
