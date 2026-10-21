import { cn } from "@workspace/ui/lib/utils"
import type { Part } from "@/lib/fluke/two-week"

/** A sentence with its numbers in mono. A coloured change is a filled pill only when it is outside noise. */
export function Parts({ parts, significant }: { parts: Part[]; significant?: boolean }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          p
        ) : (
          <span
            key={i}
            className={cn(
              "num whitespace-nowrap",
              p.tone === "up" && "text-up",
              p.tone === "down" && "text-down",
              p.tone && significant && "rounded-full px-1.5 py-px font-semibold",
              p.tone === "up" && significant && "bg-up-bg",
              p.tone === "down" && significant && "bg-down-bg",
            )}
          >
            {p.num}
          </span>
        ),
      )}
    </>
  )
}
