import type { Verdict as VerdictData } from "@workspace/metrics"
import { cn } from "@workspace/ui/lib/utils"

/**
 * The week's answer in Geist Pixel, written by fixed rules from the data.
 * Pixel-true sizes only: 33 (mobile), 46 (dashboard), 79 (site hero).
 */
export function Verdict({
  verdict,
  size = 46,
  className,
  as: Tag = "h1",
}: {
  verdict: VerdictData
  size?: 33 | 46 | 79
  className?: string
  as?: "h1" | "h2" | "p"
}) {
  return (
    <Tag
      className={cn(
        size === 33 && "pixel-33",
        size === 46 && "pixel-46",
        size === 79 && "pixel-79",
        "text-balance text-foreground",
        className,
      )}
    >
      {verdict.parts.map((p, i) => (
        <span key={i} className={cn(p.tone === "up" && "text-up", p.tone === "down" && "text-down")}>
          {p.text}
        </span>
      ))}
      <span className="cursor-block" aria-hidden />
    </Tag>
  )
}
