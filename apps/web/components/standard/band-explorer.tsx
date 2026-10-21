"use client"

import * as React from "react"
import NumberFlow from "@number-flow/react"
import { cn } from "@workspace/ui/lib/utils"
import { bandParts, niceVolume, type BandModel } from "@/lib/standard/band-math"

const MAX = 100_000
const flowTiming = {
  transformTiming: { duration: 160, easing: "steps(4, end)" },
  spinTiming: { duration: 160, easing: "steps(4, end)" },
  opacityTiming: { duration: 80, easing: "linear" },
} as const

const fmt = (n: number) => n.toLocaleString("en-US")

const range = [
  "h-5 w-full cursor-pointer appearance-none bg-transparent outline-none",
  "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full",
  "[&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--foreground)_var(--fill),var(--band)_var(--fill))]",
  "[&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
  "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-foreground [&::-webkit-slider-thumb]:bg-card",
  "focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ring focus-visible:[&::-webkit-slider-thumb]:ring-offset-2",
  "[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-band",
  "[&::-moz-range-progress]:h-1 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-foreground",
  "[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-foreground [&::-moz-range-thumb]:bg-card",
].join(" ")

/**
 * The noise band at the visitor's own weekly volume. The slider is logarithmic (volumes span
 * three orders of magnitude) and snaps to two significant figures; the field takes any number.
 */
export function BandExplorer({
  model,
  initial = 800,
  compact = false,
  className,
}: {
  model: BandModel
  initial?: number
  /** Statement and slider only, for the Why page's first step. */
  compact?: boolean
  className?: string
}) {
  const [volume, setVolume] = React.useState(initial)
  const [draft, setDraft] = React.useState(fmt(initial))
  const id = React.useId()
  const lo = Math.log10(Math.max(1, Math.min(model.min, 100)))
  const hi = Math.log10(MAX)
  const pos = (v: number) => (Math.log10(Math.min(Math.max(v, 10 ** lo), MAX)) - lo) / (hi - lo)

  const set = (v: number) => {
    const n = Math.max(1, Math.round(v))
    setVolume(n)
    setDraft(fmt(n))
  }

  const tooFew = volume < model.min
  const band = bandParts(model, volume)
  const nearest = model.references.reduce<number | null>(
    (best, r) => (best == null || Math.abs(Math.log(r.volume / volume)) < Math.abs(Math.log(best / volume)) ? r.volume : best),
    null,
  )

  return (
    <div className={cn("min-w-0", className)} data-testid="band-explorer">
      <p className={cn("max-w-3xl leading-snug tracking-[-0.01em] text-balance", compact ? "text-[19px] sm:text-[21px]" : "text-[21px] sm:text-[24px]")}>
        At{" "}
        <NumberFlow value={volume} className="num" format={{ useGrouping: true }} {...flowTiming} /> {model.unit},{" "}
        {tooFew ? (
          <>the week is too small to judge: chance moves it more than most real changes do.</>
        ) : (
          <>
            a move inside{" "}
            <span className="num whitespace-nowrap" data-testid="band-value">
              <NumberFlow
                value={band.value}
                prefix="±"
                suffix={band.suffix.replace(" ", " ")}
                format={{ minimumFractionDigits: band.digits, maximumFractionDigits: band.digits }}
                {...flowTiming}
              />
            </span>{" "}
            is noise.
          </>
        )}
      </p>

      <div className={cn("grid max-w-3xl items-center gap-x-5 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto]", compact ? "mt-5" : "mt-7")}>
        <div className="relative pb-6">
          <label htmlFor={`${id}-range`} className="sr-only">
            Your weekly volume, {model.unit}
          </label>
          <input
            id={`${id}-range`}
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(pos(volume) * 1000)}
            onChange={(e) => set(niceVolume(10 ** (lo + (Number(e.target.value) / 1000) * (hi - lo))))}
            aria-valuetext={`${fmt(volume)} ${model.unit}`}
            className={range}
            style={{ "--fill": `${pos(volume) * 100}%` } as React.CSSProperties}
          />
          <div className="absolute inset-x-0 bottom-0 h-4" aria-hidden>
            {model.references.map((r) => (
              <button
                key={r.volume}
                type="button"
                tabIndex={-1}
                onClick={() => set(r.volume)}
                className={cn(
                  "absolute -translate-x-1/2 font-mono text-[11px] leading-none text-muted-foreground transition-colors duration-[80ms] hover:text-foreground",
                  r.volume === volume && "text-foreground",
                )}
                style={{ left: `calc(8px + (100% - 16px) * ${pos(r.volume)})` }}
              >
                {r.volume >= 1000 ? `${r.volume / 1000}k` : r.volume}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 pb-6 max-sm:pb-0">
          <input
            id={`${id}-volume`}
            inputMode="numeric"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              const n = Number(e.target.value.replace(/[^\d.]/g, ""))
              if (Number.isFinite(n) && n >= 1) setVolume(Math.round(n))
            }}
            onBlur={() => setDraft(fmt(volume))}
            aria-label={`Your weekly volume, ${model.unit}`}
            className="num h-9 w-[7.5rem] rounded-md border border-input bg-card px-3 text-right text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="font-mono text-[12px] whitespace-nowrap text-muted-foreground">a week</span>
        </div>
      </div>

      {!compact && (
        <>
          {model.detect5 != null && (
            <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
              A 5% move clears noise from about <span className="num text-foreground">{fmt(niceVolume(model.detect5))}</span> {model.unit}.
              Below <span className="num text-foreground">{fmt(model.min)}</span> a week the answer is &ldquo;too few to say&rdquo;, never a number.
            </p>
          )}
          <table className="mt-8 w-full max-w-xl text-[13.5px]" aria-label="Noise band at four weekly volumes">
            <thead>
              <tr className="border-b border-border">
                <th className="label-mono py-2 pr-4 text-left font-medium">Weekly volume</th>
                <th className="label-mono py-2 pr-4 text-right font-medium">Noise band</th>
                <th className="label-mono py-2 text-right font-medium">{model.altLabel}</th>
              </tr>
            </thead>
            <tbody>
              {model.references.map((r) => {
                const on = r.volume === nearest && !tooFew
                return (
                  <tr
                    key={r.volume}
                    onClick={() => set(r.volume)}
                    className={cn("cursor-pointer border-b border-border transition-colors duration-[80ms] hover:bg-accent", on && "bg-accent")}
                    aria-current={on || undefined}
                  >
                    <td className="py-2.5 pr-4">
                      <span className={cn("mr-2 inline-block w-2 font-mono text-up", !on && "invisible")} aria-hidden>
                        &gt;
                      </span>
                      <span className="num">{fmt(r.volume)}</span>
                      <span className="text-muted-foreground"> {model.unit.replace(/ a week$/, "")}</span>
                    </td>
                    <td className="num py-2.5 pr-4 text-right">{r.move}</td>
                    <td className="num py-2.5 text-right text-muted-foreground">
                      {r.alt}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
