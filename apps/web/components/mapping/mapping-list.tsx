"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { formatCompact } from "@workspace/metrics"
import {
  mappedMeasures,
  measureExpr,
  measureInfo,
  newCustomersInfo,
  type DiscoveredEvent,
  type Mapping,
  type MappedMeasure,
  type MeasureSpec,
} from "@workspace/sources"
import { Button } from "@workspace/ui/components/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@workspace/ui/components/command"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

const sourceLabel: Record<MeasureSpec["source"], string> = { claude: "Claude", rules: "Name match", you: "You" }

export function Confidence({ value }: { value: number }) {
  const low = value < 0.75
  return (
    <span
      className={cn("inline-flex items-center justify-end gap-2 font-mono text-[12px]", low ? "text-muted-foreground" : "text-foreground")}
      title={low ? "Check this one" : "Confident"}
    >
      <span className="block h-1 w-12 overflow-hidden rounded-full bg-band" aria-hidden>
        <span className="block h-full bg-foreground" style={{ width: `${Math.round(value * 100)}%`, opacity: low ? 0.45 : 1 }} />
      </span>
      {value.toFixed(2)}
    </span>
  )
}

function Picker({
  value,
  placeholder,
  options,
  onChange,
  label,
}: {
  value?: string
  placeholder: string
  options: { value: string; hint?: string }[]
  onChange: (v: string | undefined) => void
  label: string
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-label={label} aria-expanded={open} className="h-8 max-w-full justify-between gap-2 font-mono text-[12.5px] font-normal">
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value ?? placeholder}</span>
          <ChevronsUpDown className="size-3.5 opacity-50" strokeWidth={1.5} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} className="font-mono text-[12.5px]" />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  onSelect={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                  className="font-mono text-[12.5px]"
                >
                  <Check className={cn("size-3.5", o.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.value}</span>
                  {o.hint && <span className="ml-auto shrink-0 text-muted-foreground">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/**
 * One row per measure: what it reads, the event chosen, how sure the mapper is and why,
 * and the fixed query fragment it compiles to. Editable during setup.
 */
export function MappingList({
  mapping,
  events,
  onChange,
}: {
  mapping: Mapping
  events?: DiscoveredEvent[]
  onChange?: (m: Mapping) => void
}) {
  const editable = !!onChange && !!events
  const set = (m: MappedMeasure, spec: MeasureSpec | undefined) => onChange?.({ ...mapping, [m]: spec })
  const eventOptions = (events ?? []).map((e) => ({ value: e.event, hint: `${formatCompact(e.events)} / 30d` }))

  return (
    <ol className="divide-y divide-border rounded-lg border border-border bg-card">
      {mappedMeasures.map((m) => {
        const spec = mapping[m]
        const info = measureInfo[m]
        const ev = events?.find((e) => e.event === spec?.event)
        const numeric = (ev?.properties ?? []).filter((p) => p.numeric).map((p) => ({ value: p.key, hint: p.example }))
        return (
          <li key={m} className="grid gap-x-6 gap-y-2 px-5 py-4 md:grid-cols-[180px_minmax(0,1fr)_120px]" data-measure={m}>
            <div>
              <div className="text-[14px] font-medium">{info.name}</div>
              <div className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{info.reads}</div>
            </div>
            <div className="min-w-0">
              {editable ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Picker
                    label="Event"
                    value={spec?.event}
                    placeholder="Not mapped"
                    options={eventOptions}
                    onChange={(e) =>
                      e &&
                      set(m, {
                        event: e,
                        property: info.needsProperty ? spec?.property : undefined,
                        confidence: 1,
                        source: "you",
                        reason: "Chosen by you.",
                      })
                    }
                  />
                  {info.needsProperty && spec && (
                    <>
                      <span className="text-[12.5px] text-muted-foreground">sum of</span>
                      <Picker
                        label="Property"
                        value={spec.property}
                        placeholder="Pick a number"
                        options={numeric}
                        onChange={(p) => p && set(m, { ...spec, property: p, confidence: 1, source: "you", reason: "Chosen by you." })}
                      />
                    </>
                  )}
                  {spec?.filter && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-mono text-[12px] text-muted-foreground">
                      where {spec.filter.property} {spec.filter.op} &quot;{spec.filter.value}&quot;
                      <button type="button" aria-label="Remove filter" className="hover:text-foreground" onClick={() => set(m, { ...spec, filter: undefined, source: "you" })}>
                        <X className="size-3" />
                      </button>
                    </span>
                  )}
                  {spec && !info.required && (
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => set(m, undefined)}>
                      Skip
                    </Button>
                  )}
                </div>
              ) : spec ? (
                <code className="font-mono text-[13px] break-words">
                  {spec.event}
                  {spec.property ? <span className="text-muted-foreground"> · sum({spec.property})</span> : null}
                  {spec.filter ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · where {spec.filter.property} {spec.filter.op} &quot;{spec.filter.value}&quot;
                    </span>
                  ) : null}
                </code>
              ) : (
                <span className="text-[13px] text-muted-foreground">Not mapped. Rows that need it are hidden.</span>
              )}
              {spec?.reason && (
                <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">
                  <span className="text-foreground">{sourceLabel[spec.source]}:</span> {spec.reason}
                </p>
              )}
              {spec && (!info.needsProperty || spec.property) && (
                <code className="mt-1.5 block truncate font-mono text-[11.5px] text-muted-foreground/80" title={measureExpr(m, spec)}>
                  {measureExpr(m, spec)}
                </code>
              )}
            </div>
            <div className="md:text-right">{spec && <Confidence value={spec.confidence} />}</div>
          </li>
        )
      })}
      <li className="grid gap-x-6 gap-y-2 px-5 py-4 md:grid-cols-[180px_minmax(0,1fr)_120px]">
        <div>
          <div className="text-[14px] font-medium">{newCustomersInfo.name}</div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">Derived from Orders.</div>
        </div>
        <div className="min-w-0 text-[13px] text-muted-foreground">
          {mapping.orders ? newCustomersInfo.reads : "Needs Orders."}
          {editable && mapping.orders && (
            <label className="mt-2 flex items-center gap-2 text-foreground">
              <input
                type="checkbox"
                checked={mapping.newCustomers}
                onChange={(e) => onChange?.({ ...mapping, newCustomers: e.target.checked })}
                className="size-4 accent-[var(--up)]"
              />
              Count new customers
            </label>
          )}
        </div>
        <div />
      </li>
    </ol>
  )
}
