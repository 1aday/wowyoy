"use client"

import * as React from "react"
import { dialectNames, dialects, type Dialect } from "@workspace/metrics"
import { cn } from "@workspace/ui/lib/utils"
import { tokenizeSql, type SqlTokenType } from "@/lib/standard/sql"
import { CopyButton } from "./copy-button"

/* The visitor's dialect is shared by every query block on the page and remembered in this browser. */
const KEY = "wowyoy:dialect"
const listeners = new Set<() => void>()
let current: Dialect | null = null

function readDialect(): Dialect {
  if (current) return current
  try {
    const v = window.localStorage.getItem(KEY)
    if (v && (dialects as readonly string[]).includes(v)) current = v as Dialect
  } catch {}
  return current ?? "hogql"
}

function setDialect(d: Dialect) {
  current = d
  try {
    window.localStorage.setItem(KEY, d)
  } catch {}
  listeners.forEach((l) => l())
}

function useDialect() {
  return React.useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    readDialect,
    () => "hogql" as Dialect,
  )
}

const tone: Record<SqlTokenType, string> = {
  comment: "text-muted-foreground",
  keyword: "font-medium text-foreground",
  function: "text-foreground",
  string: "text-chart-2",
  number: "text-foreground",
  ident: "text-foreground/80",
  punct: "text-muted-foreground",
  space: "",
}

export function SqlCode({ sql }: { sql: string }) {
  const tokens = React.useMemo(() => tokenizeSql(sql), [sql])
  return (
    <code>
      {tokens.map((t, i) =>
        t.type === "space" ? (
          t.text
        ) : (
          <span key={i} className={tone[t.type]}>
            {t.text}
          </span>
        ),
      )}
    </code>
  )
}

/**
 * One weekly query in four dialects: tabs, a copy button for the open tab, and what the query assumes.
 * Dialects with no query (a hand-written spec has no breakdown form) are left out.
 */
export function QueryTabs({
  queries,
  notes,
  label,
  className,
}: {
  queries: Partial<Record<Dialect, string | null>>
  /** Per dialect: what the query assumes (schema, where it runs). */
  notes?: Partial<Record<Dialect, string>>
  /** Names the block for screen readers and the copy button: "Checkout conversion query". */
  label: string
  className?: string
}) {
  const available = dialects.filter((d) => !!queries[d])
  const preferred = useDialect()
  const active = available.includes(preferred) ? preferred : (available[0] ?? "hogql")
  const id = React.useId()
  const tabs = React.useRef<Record<string, HTMLButtonElement | null>>({})
  const listRef = React.useRef<HTMLDivElement>(null)
  const [bar, setBar] = React.useState<{ left: number; width: number } | null>(null)

  React.useLayoutEffect(() => {
    const el = tabs.current[active]
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth })
  }, [active])

  if (!available.length) return null
  const sql = queries[active] ?? ""

  const onKey = (e: React.KeyboardEvent) => {
    const i = available.indexOf(active)
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? available.length - 1 : null
    if (next == null) return
    e.preventDefault()
    const d = available[(next + available.length) % available.length]!
    setDialect(d)
    tabs.current[d]?.focus()
  }

  return (
    <div className={cn("min-w-0 overflow-hidden rounded-xl border border-border bg-card", className)} data-slot="query-tabs">
      <div className="flex h-11 items-center justify-between gap-2 border-b border-border pr-1.5 pl-1.5 sm:pl-2.5">
        <div ref={listRef} role="tablist" aria-label={`${label}, by SQL dialect`} className="relative flex h-full min-w-0 items-stretch" onKeyDown={onKey}>
          {available.map((d) => (
            <button
              key={d}
              ref={(el) => {
                tabs.current[d] = el
              }}
              type="button"
              role="tab"
              id={`${id}-${d}`}
              aria-selected={d === active}
              aria-controls={`${id}-panel`}
              tabIndex={d === active ? 0 : -1}
              onClick={() => setDialect(d)}
              className={cn(
                "px-2 font-mono text-[12px] whitespace-nowrap transition-colors duration-[80ms] sm:px-2.5 sm:text-[12.5px]",
                d === active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                // Before the sliding bar is measured (first paint), the active tab draws its own underline.
                !bar && d === active && "relative after:absolute after:inset-x-1.5 after:bottom-[-1px] after:h-[2px] after:bg-foreground",
              )}
            >
              {dialectNames[d]}
            </button>
          ))}
          {bar && (
            <span
              aria-hidden
              className="absolute bottom-[-1px] h-[2px] bg-foreground transition-[left,width] duration-[240ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{ left: bar.left + 6, width: Math.max(0, bar.width - 12) }}
            />
          )}
        </div>
        <CopyButton text={sql} label="Copy" aria-label={`Copy the ${dialectNames[active]} query`} data-testid="copy-query" className="max-sm:px-2" />
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${active}`} tabIndex={0} className="outline-none">
        <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.75] sm:px-5" data-dialect={active}>
          <SqlCode sql={sql} />
        </pre>
        {notes?.[active] && <p className="border-t border-border px-4 py-2.5 font-mono text-[11.5px] leading-relaxed text-muted-foreground sm:px-5">{notes[active]}</p>}
      </div>
    </div>
  )
}
