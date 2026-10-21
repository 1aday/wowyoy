import { ArrowUpRight } from "lucide-react"
import { feedInfo, type FeedResult } from "@workspace/feeds"
import { formatWeek } from "@workspace/metrics"
import { cn } from "@workspace/ui/lib/utils"

const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "")
  } catch {
    return url
  }
}

/**
 * Step 2 of a Why page: this week's outside events from the feeds that can move the metric.
 * Each feed gets a row whatever happened: its events, "nothing this week", or unavailable.
 */
export function WorldEvents({ results }: { results: FeedResult[] }) {
  if (!results.length) {
    return (
      <p className="rounded-xl border border-dashed border-border px-5 py-6 text-[15px] leading-relaxed text-muted-foreground">
        No outside source tracks causes for this metric yet. Its moves come from inside the business: go to step 3.
      </p>
    )
  }
  const events = results.reduce((n, r) => n + r.events.length, 0)
  const down = results.filter((r) => r.status === "unavailable").length
  const quiet = events === 0 && down === 0

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" data-testid="world-events">
      {quiet && (
        <div className="border-b border-border px-5 py-6 sm:px-6">
          <p className="text-[17px] leading-snug">No outside events this week for these sources.</p>
          <p className="mt-1.5 text-[14px] text-muted-foreground">So the cause, if the move is real, is inside the business.</p>
        </div>
      )}
      {down === results.length && (
        <div className="border-b border-border px-5 py-5 text-[14px] leading-relaxed text-muted-foreground sm:px-6">
          None of these sources could be read for this week. Check them directly before ruling the world out.
        </div>
      )}
      <ul className="divide-y divide-border">
        {results.map((r) => {
          const info = feedInfo[r.feed]
          return (
            <li key={r.feed} className="px-5 py-4 sm:px-6" data-feed={r.feed} data-status={r.status}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <a href={info.home} className="inline-flex items-center gap-1 text-[14.5px] font-medium underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
                  {info.name}
                  <ArrowUpRight className="size-3.5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                </a>
                <span className={cn("font-mono text-[12px]", r.status === "unavailable" ? "text-muted-foreground" : "text-foreground")}>
                  {r.status === "unavailable"
                    ? "feed unavailable"
                    : r.events.length
                      ? `${r.events.length} event${r.events.length === 1 ? "" : "s"}`
                      : "nothing this week"}
                </span>
              </div>
              {r.status === "unavailable" && (
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Couldn&apos;t read it for this week. Check{" "}
                  <a href={info.home} className="font-mono text-[12.5px] text-foreground underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
                    {host(info.home)}
                  </a>{" "}
                  directly.
                </p>
              )}
              {r.events.length > 0 && (
                <ul className="mt-3 space-y-2.5">
                  {r.events.map((e) => (
                    <li key={e.id} className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-3 text-[14px] leading-snug">
                      <span className="num pt-px text-[12.5px] text-muted-foreground">{formatWeek(e.date)}</span>
                      <span className="min-w-0">
                        <a href={e.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                          {e.title}
                        </a>
                        <span className="ml-2 font-mono text-[11px] tracking-[0.04em] text-muted-foreground uppercase">
                          {e.severity} · {e.source}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
