"use client"

import { cn } from "@workspace/ui/lib/utils"
import { Field } from "@/components/field"
import { kindInfo, type TwoWeekText } from "@/lib/fluke/two-week"
import { UnitInput } from "./unit-input"

type Errors = Partial<Record<"before" | "after" | "volume", string>>

/**
 * Week before, last week and the volume behind them. `row` puts all three on one line once the
 * container is wide enough (the embed); otherwise the volume gets its own line with a hint (the page).
 */
export function TwoWeekFields({
  text,
  onChange,
  errors,
  id,
  volumeLabel,
  row,
}: {
  text: TwoWeekText
  onChange: (t: TwoWeekText) => void
  errors: Errors
  id: string
  /** The spec's own volume unit, e.g. "Checkouts started a week". */
  volumeLabel?: string
  row?: boolean
}) {
  const info = kindInfo[text.kind]
  const set = (k: "before" | "after" | "volume") => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...text, [k]: e.target.value })
  return (
    <div className={cn("grid grid-cols-2 gap-x-3 gap-y-4", row && info.volume && "@lg:grid-cols-[1fr_1fr_1.25fr]")}>
      <Field label="Week before" htmlFor={`${id}-before`} error={errors.before}>
        <UnitInput id={`${id}-before`} unit={info.unit} value={text.before} onChange={set("before")} aria-invalid={!!errors.before} />
      </Field>
      <Field label="Last week" htmlFor={`${id}-after`} error={errors.after}>
        <UnitInput id={`${id}-after`} unit={info.unit} value={text.after} onChange={set("after")} aria-invalid={!!errors.after} />
      </Field>
      {info.volume ? (
        <Field
          label={volumeLabel ?? info.volume.label}
          htmlFor={`${id}-volume`}
          error={errors.volume}
          hint={row ? undefined : info.volume.hint}
          className={cn("col-span-2", row && "@lg:col-span-1")}
        >
          <UnitInput id={`${id}-volume`} value={text.volume} onChange={set("volume")} inputMode="numeric" aria-invalid={!!errors.volume} />
        </Field>
      ) : null}
    </div>
  )
}
