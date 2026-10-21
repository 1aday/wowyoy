"use client"

import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

/** A number field with its unit set inside: "$" before, "%" after. Accepts what people paste ("$412k", "1,184"). */
export function UnitInput({ unit, className, ...props }: Omit<React.ComponentProps<typeof Input>, "type"> & { unit?: "%" | "$" | "" }) {
  return (
    <div className={cn("relative", className)}>
      {unit === "$" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center font-mono text-[13px] text-muted-foreground"
        >
          $
        </span>
      ) : null}
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className={cn("h-9 num font-mono text-[14px] md:text-[14px]", unit === "$" && "pl-6", unit === "%" && "pr-7")}
        {...props}
      />
      {unit === "%" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center font-mono text-[13px] text-muted-foreground"
        >
          %
        </span>
      ) : null}
    </div>
  )
}
