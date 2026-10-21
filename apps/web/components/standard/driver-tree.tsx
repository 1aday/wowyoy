"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

export interface TreeDriver {
  n: number
  id: string
  label: string
  /** The driver's Standard page, when it is a metric published on this deployment. */
  href: string | null
  /** What the driver is: a metric id, a breakdown property, or a world feed. */
  tag: string | null
  check: string
  yes: string
}

const line = "bg-muted-foreground/35"

/**
 * The driver tree: the metric at the root, its drivers in the order an operator checks them.
 * Hovering or focusing a driver shows its check beside the tree (wide screens); narrow screens
 * print each check under its driver, so nothing depends on hover.
 */
export function DriverTree({ root, drivers, direction = "dropped" }: { root: string; drivers: TreeDriver[]; direction?: "dropped" | "spiked" }) {
  const [active, setActive] = React.useState(drivers[0]?.id ?? null)
  const shown = drivers.find((d) => d.id === active) ?? drivers[0]
  if (!drivers.length) return null

  return (
    <div className="grid items-center gap-x-0 gap-y-3 md:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,20rem)_minmax(0,1fr)]" data-testid="driver-tree">
      <div className="relative z-10 flex md:pr-8 md:after:absolute md:after:top-1/2 md:after:right-0 md:after:h-px md:after:w-8 md:after:bg-muted-foreground/35">
        <div className="rounded-lg border border-foreground bg-card px-3.5 py-2.5 md:max-w-[10rem]">
          <div className="label-mono">Metric</div>
          <div className="mt-1 text-[15px] leading-snug font-medium">{root}</div>
        </div>
      </div>

      <ol className="relative max-md:ml-5" aria-label={`Drivers of ${root}, in the order to check them`}>
        {drivers.map((d, i) => {
          const first = i === 0
          const lastOne = i === drivers.length - 1
          const on = shown?.id === d.id
          const inner = (
            <>
              <span className={cn("num w-4 shrink-0 text-[12px]", on ? "text-foreground" : "text-muted-foreground")}>{d.n}</span>
              <span className="min-w-0 flex-1 truncate text-[14px]">{d.label}</span>
              {d.tag && <span className="hidden max-w-[45%] truncate font-mono text-[11px] text-muted-foreground sm:inline lg:hidden">{d.tag}</span>}
              {d.href && <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />}
            </>
          )
          const chip = cn(
            "flex h-10 w-full min-w-0 items-center gap-2.5 rounded-md border bg-card px-3 text-left transition-colors duration-[80ms]",
            on ? "border-foreground/60" : "border-border hover:border-foreground/40",
          )
          const events = { onMouseEnter: () => setActive(d.id), onFocus: () => setActive(d.id) }
          return (
            <li key={d.id} className="relative py-1.5 pl-7">
              {/* trunk: the vertical line through every driver, joined to the root */}
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 w-px",
                  line,
                  first ? "top-[1.625rem] max-md:-top-3" : "top-0",
                  lastOne ? "h-[1.625rem]" : "bottom-0",
                  first && lastOne && "max-md:h-[2.375rem]",
                  first && lastOne && "md:hidden",
                )}
              />
              {/* branch */}
              <span aria-hidden className={cn("absolute top-[1.625rem] left-0 h-px w-7", line)} />
              {d.href ? (
                <Link href={d.href} className={chip} {...events} aria-describedby={`check-${d.id}`}>
                  {inner}
                </Link>
              ) : (
                <div className={chip} {...events} tabIndex={0} aria-describedby={`check-${d.id}`}>
                  {inner}
                </div>
              )}
              <p id={`check-${d.id}`} className="mt-1.5 mb-1 pl-[1.625rem] text-[13px] leading-relaxed text-muted-foreground lg:sr-only">
                {d.check}
              </p>
            </li>
          )
        })}
      </ol>

      {shown && (
        <div className="hidden min-w-0 self-center border-l border-border pl-6 lg:ml-10 lg:block" aria-live="polite">
          <div className="label-mono">
            If it {direction} · {shown.n} of {drivers.length}
          </div>
          <p className="mt-3 text-[17px] leading-snug text-balance">{shown.check}</p>
          <div className="label-mono mt-5">A yes looks like</div>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{shown.yes}</p>
          {shown.tag && (
            <p className="mt-5 font-mono text-[12px] text-muted-foreground">
              {shown.href ? "Its own metric: " : shown.tag.startsWith("by ") ? "Split " : shown.tag.startsWith("world") ? "Outside source: " : "Metric in review: "}
              <span className="text-foreground">{shown.tag.replace(/^world · /, "")}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
