"use client"

import { cn } from "@workspace/ui/lib/utils"

/** Pill segmented control: one choice from a few, the chosen one filled in ink. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T | null
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-full border border-border bg-card px-3 font-mono text-[12px] text-muted-foreground transition-colors duration-[80ms] hover:bg-muted hover:text-foreground",
            value === o.value && "border-foreground bg-foreground text-background hover:bg-foreground hover:text-background",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
