"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { Family } from "@workspace/metrics"
import { cn } from "@workspace/ui/lib/utils"

export interface IndexItem {
  id: string
  name: string
  oneLine: string
  family: Family
  kind: string
  /** The noise band at the index's reference volume ("±4.9 pt"), or null for process metrics. */
  band: string | null
  /** Aliases and event names, matched by the filter but not shown. */
  terms: string
  href: string
}

export interface IndexFamily {
  id: Family
  name: string
  /** Specs written for this family but not yet reviewed (hidden on this deployment). */
  inReview: number
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9$_ ]+/g, " ")

/**
 * The Standard's index: every published metric by family, with an inline filter that works like the
 * brand's command line. ⌘K or / focuses it, ↑ ↓ move, ↵ opens, esc clears.
 */
export function MetricIndex({ items, families, volume }: { items: IndexItem[]; families: IndexFamily[]; volume: number }) {
  const router = useRouter()
  const [q, setQ] = React.useState("")
  const [sel, setSel] = React.useState(0)
  const input = React.useRef<HTMLInputElement>(null)
  const words = norm(q).split(/\s+/).filter(Boolean)
  const hay = React.useMemo(() => new Map(items.map((i) => [i.id, norm(`${i.name} ${i.id} ${i.oneLine} ${i.terms} ${i.family}`)])), [items])
  const matches = words.length ? items.filter((i) => words.every((w) => hay.get(i.id)!.includes(w))) : items
  // A family with nothing published and nothing in review isn't part of the Standard yet: leave it out.
  const groups = families
    .filter((f) => f.inReview > 0 || items.some((i) => i.family === f.id))
    .map((f) => ({ ...f, items: matches.filter((i) => i.family === f.id) }))
  const flat = groups.flatMap((g) => g.items)
  const active = words.length ? flat[Math.min(sel, flat.length - 1)] : undefined

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      setSel((s) => Math.max(0, Math.min(flat.length - 1, s + (e.key === "ArrowDown" ? 1 : -1))))
    } else if (e.key === "Enter" && active) {
      router.push(active.href)
    } else if (e.key === "Escape") {
      setQ("")
      setSel(0)
    }
  }

  return (
    <div>
      <div className="sticky top-14 z-20 border-b border-border bg-background/90 py-3 backdrop-blur">
        <label className="flex h-11 items-center gap-2.5 rounded-lg border border-border bg-card px-3.5 font-mono text-[14px] focus-within:border-foreground/50">
          <span className="text-up" aria-hidden>
            &gt;
          </span>
          <span className="text-foreground max-sm:hidden" aria-hidden>
            find
          </span>
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setSel(0)
            }}
            onKeyDown={onInputKey}
            placeholder="a metric, an alias or an event"
            aria-label="Filter metrics"
            aria-controls="metric-index"
            spellCheck={false}
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
          {q ? (
            <span className="num shrink-0 text-[12px] text-muted-foreground" aria-live="polite">
              {matches.length} of {items.length}
            </span>
          ) : (
            <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground sm:inline">⌘K</kbd>
          )}
        </label>
        <nav aria-label="Families" className="-mx-4 mt-3 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0">
          <ul className="flex gap-1.5 whitespace-nowrap sm:flex-wrap">
            {groups.map((g) => (
              <li key={g.id}>
                <a
                  href={`#${g.id}`}
                  className={cn(
                    "inline-flex h-7 items-center gap-2 rounded-full border border-border px-3 text-[12.5px] transition-colors duration-[80ms] hover:bg-accent",
                    !g.items.length && "opacity-45",
                  )}
                >
                  {g.name}
                  <span className="num text-[11.5px] text-muted-foreground">{g.items.length}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div id="metric-index">
        {!matches.length && (
          <p className="py-16 text-[15px] text-muted-foreground">
            No metric matches &ldquo;{q}&rdquo;. Try a name, an alias like <span className="font-mono text-foreground">AOV</span> or an event like{" "}
            <span className="font-mono text-foreground">order_completed</span>.
          </p>
        )}
        {groups.map((g) =>
          !g.items.length && words.length ? null : (
            <section key={g.id} id={g.id} aria-labelledby={`${g.id}-h`} className="scroll-mt-40 pt-12 sm:pt-14">
              <div className="flex items-baseline justify-between gap-4 border-b border-foreground pb-3">
                <h2 id={`${g.id}-h`} className="text-[19px] tracking-[-0.01em]">
                  {g.name}
                </h2>
                <span className="num text-[12px] text-muted-foreground">
                  {g.items.length} {g.items.length === 1 ? "metric" : "metrics"}
                  {g.inReview > 0 && ` · ${g.inReview} in review`}
                </span>
              </div>
              {g.items.length > 0 && (
                <div className="hidden grid-cols-[minmax(0,15rem)_minmax(0,1fr)_7rem_6.5rem] gap-x-6 border-b border-border py-2 md:grid">
                  <span className="label-mono">Metric</span>
                  <span className="label-mono">Definition</span>
                  <span className="label-mono">Kind</span>
                  <span className="label-mono text-right">Noise at {volume}/wk</span>
                </div>
              )}
              {g.items.length ? (
                <ul>
                  {g.items.map((i) => {
                    const on = active?.id === i.id
                    return (
                      <li key={i.id} className="border-b border-border">
                        <Link
                          href={i.href}
                          data-metric={i.id}
                          aria-current={on || undefined}
                          className={cn(
                            "group relative -mx-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 px-4 gap-y-1 py-3.5 transition-colors duration-[80ms] hover:bg-accent md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_7rem_6.5rem] md:py-3",
                            on && "bg-accent",
                          )}
                        >
                          <span className={cn("absolute top-3.5 left-1 font-mono text-[14px] text-up md:top-3", !on && "hidden")} aria-hidden>
                            &gt;
                          </span>
                          <span className="text-[15px] leading-snug font-medium">{i.name}</span>
                          <span className="num text-right text-[12.5px] leading-snug text-muted-foreground md:order-last md:pt-px">
                            {i.band ?? <span title="No sampling floor: judged on its own week-to-week range">process</span>}
                          </span>
                          <span className="col-span-2 text-[13.5px] leading-relaxed text-muted-foreground md:col-span-1">{i.oneLine}</span>
                          <span className="hidden font-mono text-[12px] leading-snug text-muted-foreground md:block md:pt-px">{i.kind}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="py-5 text-[14px] text-muted-foreground">
                  {g.inReview > 0 ? `${g.inReview} specs written, in review. They publish the day they're signed off.` : "None yet."}
                </p>
              )}
            </section>
          ),
        )}
      </div>
    </div>
  )
}
