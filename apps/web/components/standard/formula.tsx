import type { Measure, MetricSpec } from "@workspace/metrics"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import { aggregatePhrase, filterText } from "@/lib/standard/spec-view"

type Event = MetricSpec["events"][number]

/** A canonical event name as a mono chip; hover or focus lists what other tools call it. */
export function EventChip({ name, event, className }: { name: string; event?: Event; className?: string }) {
  const chip = (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-[5px] border border-border bg-background px-1.5 font-mono text-[12px] leading-none text-foreground",
        event?.also_called.length && "cursor-help decoration-muted-foreground/50 decoration-dotted underline-offset-[3px] hover:underline",
        className,
      )}
      tabIndex={event?.also_called.length ? 0 : undefined}
    >
      {name === "*" ? "any event" : name}
    </span>
  )
  if (!event?.also_called.length) return chip
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <span className="font-mono text-[11.5px]">Also called {event.also_called.join(", ")}</span>
      </TooltipContent>
    </Tooltip>
  )
}

function MeasureBlock({ m, events, align = "left" }: { m: Measure; events: Event[]; align?: "left" | "center" }) {
  return (
    <div className={cn("min-w-0", align === "center" && "text-center")}>
      <div className="text-[17px] leading-snug">{m.label}</div>
      <div className={cn("mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 font-mono text-[12px] text-muted-foreground", align === "center" && "justify-center")}>
        <span>{aggregatePhrase(m)}</span>
        <EventChip name={m.event} event={events.find((e) => e.name === m.event)} />
        {m.where.map((f, i) => (
          <span key={i} className="whitespace-nowrap">
            {i === 0 ? "where" : "and"} <span className="text-foreground">{filterText(f)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * The formula drawn from the spec's measures: a real fraction for rates and ratios,
 * a difference when something is subtracted, a single measure for counts and sums.
 */
export function Formula({ spec }: { spec: MetricSpec }) {
  const { numerator: num, subtract: sub, denominator: den, events } = spec
  // A hand-written query is the definition; the measures would misdescribe it, so show what it reads instead.
  if (spec.queries) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-6 sm:px-8 sm:py-7" data-testid="formula">
        <div className="text-[17px] leading-snug">{num.label}</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[12px] text-muted-foreground">
          <span>from</span>
          {events.map((e, i) => (
            <span key={e.name} className="inline-flex items-center gap-1.5">
              {i > 0 && <span>and</span>}
              <EventChip name={e.name} event={e} />
            </span>
          ))}
        </div>
        <p className="mt-5 border-t border-border pt-4 text-[13px] leading-relaxed text-muted-foreground">
          The spec&apos;s measures can&apos;t express this metric, so its query is written by hand in all four dialects and reviewed with the spec.
        </p>
      </div>
    )
  }
  const top = sub ? (
    <div className="flex flex-wrap items-start justify-center gap-x-6 gap-y-3">
      <MeasureBlock m={num} events={events} align="center" />
      <span className="num pt-0.5 text-[17px] text-muted-foreground" aria-label="minus">
        −
      </span>
      <MeasureBlock m={sub} events={events} align="center" />
    </div>
  ) : (
    <MeasureBlock m={num} events={events} align={den ? "center" : "left"} />
  )
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-6 sm:px-8 sm:py-8" data-testid="formula">
      {den ? (
        <div className="mx-auto grid w-fit max-w-full justify-items-center">
          {top}
          <div className="my-4 h-px w-full min-w-48 bg-foreground" role="presentation" />
          <MeasureBlock m={den} events={events} align="center" />
        </div>
      ) : (
        top
      )}
    </div>
  )
}

/** The canonical events, with what other tools call them and the properties the queries read. */
export function EventList({ events }: { events: Event[] }) {
  return (
    <dl className="divide-y divide-border border-t border-border">
      {events.map((e) => (
        <div key={e.name} className="grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <dt>
            <EventChip name={e.name} event={e} />
          </dt>
          <dd className="min-w-0 text-[14px] leading-relaxed">
            <p>{e.description}</p>
            {e.also_called.length > 0 && (
              <p className="mt-1 text-muted-foreground">
                Also called <span className="font-mono text-[12.5px]">{e.also_called.join(" · ")}</span>
              </p>
            )}
            {e.properties.length > 0 && (
              <dl className="mt-2.5 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px]">
                {e.properties.map((p) => (
                  <div key={p.name} className="contents">
                    <dt className="pt-px font-mono text-[12px] text-foreground">{p.name}</dt>
                    <dd className="text-muted-foreground">{p.description}</dd>
                  </div>
                ))}
              </dl>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
