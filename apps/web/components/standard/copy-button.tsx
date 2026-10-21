"use client"

import * as React from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

/** Copies `text`, then says so for 1.6s. The label never changes width, so nothing around it shifts. */
export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  className,
  icon = true,
  ...props
}: {
  text: string
  label?: string
  copiedLabel?: string
  className?: string
  icon?: boolean
} & Omit<React.ComponentProps<"button">, "onClick" | "children">) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  React.useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); select-and-copy is the fallback.
      const ta = document.createElement("textarea")
      ta.value = text
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      ta.remove()
    }
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      type="button"
      onClick={copy}
      data-copied={copied || undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 font-mono text-[12px] text-muted-foreground transition-colors duration-[80ms] hover:bg-accent hover:text-foreground disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {icon && (copied ? <Check className="size-3.5" strokeWidth={1.5} aria-hidden /> : <Copy className="size-3.5" strokeWidth={1.5} aria-hidden />)}
      <span className="grid" aria-hidden>
        <span className={cn("col-start-1 row-start-1", copied && "invisible")}>{label}</span>
        <span className={cn("col-start-1 row-start-1", !copied && "invisible")}>{copiedLabel}</span>
      </span>
      <span className="sr-only">{label}</span>
      <span className="sr-only" aria-live="polite">
        {copied ? copiedLabel : ""}
      </span>
    </button>
  )
}
