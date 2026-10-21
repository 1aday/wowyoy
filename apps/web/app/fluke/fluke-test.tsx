"use client"

import * as React from "react"
import Link from "next/link"
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts"
import { ArrowUpRight, Link2 } from "lucide-react"
import { toast } from "sonner"
import { DOWN, FLUKE_MIN_WEEKS, MINUS, UP, flukeTest, formatFluke, parseSeries, type FlukeUnit } from "@workspace/metrics"
import { Button } from "@workspace/ui/components/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@workspace/ui/components/chart"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Prompt } from "@workspace/ui/brand/prompt"
import { cn } from "@workspace/ui/lib/utils"
import { Field } from "@/components/field"
import { Segmented } from "@/components/segmented"
import { toText, twoWeekPresets, type TwoWeekText, type TwoWeekValues } from "@/lib/fluke/two-week"
import { TwoWeekTest } from "./two-week-test"

export const presets = [
  {
    id: "checkout",
    label: "Checkout rate drop",
    name: "Checkout completion",
    text: "62.1%, 61.4%, 62.6%, 61.9%, 62.8%, 61.7%, 61.2%, 62.5%, 62.3%, 61.5%, 62.0%, 62.9%, 61.8%, 59.1%",
  },
  {
    id: "signups",
    label: "Signup spike",
    name: "Weekly signups",
    text: "1,184 1,262 1,091 1,240 1,317 1,156 1,203 1,288 1,122 1,265 1,190 1,334 1,248 1,402",
  },
  {
    id: "revenue",
    label: "Revenue bump",
    name: "Weekly revenue",
    text: "$412k, $398k, $431k, $405k, $420k, $389k, $426k, $415k, $402k, $433k, $410k, $419k, $408k, $447k",
  },
  {
    id: "rebound",
    label: "Back after a bad week",
    name: "Orders",
    text: "3,410 3,520 3,388 3,602 3,455 3,498 3,371 3,540 3,467 3,512 3,430 3,566 2,904 3,488",
  },
] as const

const INK = "var(--chart-1)"
const axis = { tickLine: false, axisLine: false, tickMargin: 8 } as const

type Mode = "history" | "two-weeks"

/** The Fluke Test: a weekly series judged by its own swing, or two weeks judged against the sampling floor. */
export function FlukeTest({ initial, initialTwoWeek }: { initial?: { name: string; text: string }; initialTwoWeek?: TwoWeekValues }) {
  const [mode, setMode] = React.useState<Mode>(initialTwoWeek ? "two-weeks" : "history")
  const [name, setName] = React.useState(initial?.name ?? presets[0].name)
  const [text, setText] = React.useState(initial?.text ?? presets[0].text)
  const [two, setTwo] = React.useState<TwoWeekText>(() => toText(initialTwoWeek ?? twoWeekPresets.rate))
  return (
    <>
      <div className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="label-mono">Test with</span>
        <Segmented
          label="Test with"
          value={mode}
          options={[
            { value: "history", label: "History" },
            { value: "two-weeks", label: "Two weeks" },
          ]}
          onChange={setMode}
        />
      </div>
      {mode === "history" ? (
        <HistoryTest name={name} setName={setName} text={text} setText={setText} />
      ) : (
        <TwoWeekTest text={two} setText={setTwo} onHistory={() => setMode("history")} />
      )}
    </>
  )
}

function HistoryTest({
  name,
  setName,
  text,
  setText,
}: {
  name: string
  setName: (s: string) => void
  text: string
  setText: (s: string) => void
}) {
  const { values, unit } = React.useMemo(() => parseSeries(text), [text])
  const res = React.useMemo(() => flukeTest(values), [values])
  const preset = presets.find((p) => p.text === text && p.name === name)?.id ?? null
  const fmt = (v: number) => formatFluke(v, unit)
  // A change in a rate is in percentage points, not percent.
  const fmtDelta = (v: number) => (unit === "%" ? `${v < 0 ? MINUS : ""}${Math.abs(v).toFixed(Math.abs(v) < 1 ? 2 : 1)} pt` : fmt(v))

  // Keep the URL shareable: the link reproduces the result.
  React.useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams()
      p.set("m", name)
      p.set("v", values.join(","))
      if (unit) p.set("u", unit === "$" ? "usd" : "pct")
      window.history.replaceState(null, "", `/fluke?${p.toString()}`)
    }, 300)
    return () => clearTimeout(t)
  }, [name, values, unit])

  const data = React.useMemo(() => {
    if (!res) return []
    const n = values.length
    const from = n - 1 - res.historyWeeks
    return values.map((v, i) => ({
      i,
      label: i === n - 1 ? "Last week" : `W${MINUS}${n - 1 - i}`,
      value: v,
      band: i >= from ? ([res.range[0], res.range[1]] as [number, number]) : null,
    }))
  }, [res, values])

  const real = res && (res.call === "real" || res.call === "building")
  const dotColor = real ? (res.zLevel > 0 ? "var(--up)" : "var(--down)") : INK
  const share = res ? `${name}: ${res.verdict} ${fmt(res.last)} last week, ${Math.abs(res.zChange).toFixed(1)}× the normal swing.` : ""

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast("Link copied")
    } catch {
      toast(window.location.href)
    }
  }

  return (
    <div className="mt-5 grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <div className="grid gap-5 rounded-lg border border-border bg-card p-5">
        <Field label="Try an example">
          <Segmented
            label="Examples"
            value={preset}
            options={presets.map((p) => ({ value: p.id, label: p.label }))}
            onChange={(id) => {
              const p = presets.find((x) => x.id === id)!
              setName(p.name)
              setText(p.text)
            }}
          />
        </Field>
        <Field label="Metric" htmlFor="fl-name">
          <Input id="fl-name" value={name} onChange={(e) => setName(e.target.value)} className="h-9" maxLength={60} />
        </Field>
        <Field
          label="Weekly values, oldest first"
          htmlFor="fl-values"
          error={values.length < FLUKE_MIN_WEEKS ? `Add at least ${FLUKE_MIN_WEEKS} weeks so there's a normal range to compare against.` : null}
          hint={`${values.length} weeks read. Last week goes at the end. Commas, spaces or new lines all work.`}
        >
          <Textarea
            id="fl-values"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="min-h-[168px] font-mono text-[13px] leading-relaxed"
          />
        </Field>
        <div className="border-l-2 border-foreground pl-3 text-[12.5px] leading-relaxed">
          <div className="label-mono mb-1">How it judges</div>
          One week&apos;s noise is read from how much your weeks usually move (up to the last 26). Comparing two weeks doubles the noise
          in play, so a change has to clear 2 × √2 of it, about 2.8 weeks&apos; worth, before it counts. A single-week line would call
          one normal week in six a real move.
        </div>
      </div>

      {res ? (
        <div className="grid min-w-0 gap-6">
          <div className="min-w-0 rounded-lg border border-border bg-card p-5 sm:p-6">
            <Prompt command="fluke_test" flags={`--metric "${name}" --weeks ${values.length}`} className="mb-3 truncate" />
            <h2 className="pixel-46 text-balance max-sm:pixel-33" data-testid="fluke-verdict">
              {res.verdict}
              <span className="cursor-block" aria-hidden />
            </h2>
            <p className="mt-4 max-w-[68ch] text-[15.5px] leading-relaxed">
              {name} was <span className="num">{fmt(res.last)}</span> last week,{" "}
              <span className={cn("num", res.change > 0 ? "text-up" : res.change < 0 ? "text-down" : "text-muted-foreground")}>
                {res.change > 0 ? UP : res.change < 0 ? DOWN : "●"}
                {fmtDelta(Math.abs(res.change))}
              </span>{" "}
              on the week before. Weeks usually swing up to <span className="num">±{fmtDelta(res.swing)}</span>, so this change is{" "}
              <span className="num">{Math.abs(res.zChange).toFixed(1)}×</span> the normal swing
              {Number.isFinite(res.oneInWeeks) && res.oneInWeeks > 1 ? (
                <>
                  , the kind chance makes about once every <span className="num">{res.oneInWeeks.toLocaleString("en-US")}</span> weeks
                </>
              ) : null}
              . A normal week sits between <span className="num">{fmt(res.range[0])}</span> and <span className="num">{fmt(res.range[1])}</span>.
            </p>
            <p className="mt-3 text-[14px] text-muted-foreground">{res.advice}</p>

            <ChartContainer config={{ value: { label: name, color: INK }, band: { label: "Normal week", color: "var(--band)" } } satisfies ChartConfig} className="mt-6 aspect-auto h-[240px] w-full">
              <ComposedChart data={data} margin={{ top: 16, right: 56, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={28} />
                <YAxis {...axis} width={64} tickFormatter={fmt} domain={["auto", "auto"]} tickCount={4} />
                <ChartTooltip
                  cursor={{ stroke: "var(--border)" }}
                  content={
                    <ChartTooltipContent
                      formatter={(v, n) => (
                        <div className="flex w-full justify-between gap-4">
                          <span className="text-muted-foreground">{n === "band" ? "Normal week" : name}</span>
                          <span className="num font-medium">{Array.isArray(v) ? `${fmt(Number(v[0]))} – ${fmt(Number(v[1]))}` : fmt(Number(v))}</span>
                        </div>
                      )}
                    />
                  }
                />
                <Area dataKey="band" type="linear" stroke="none" fill="var(--color-band)" fillOpacity={1} activeDot={false} />
                <Line dataKey="value" type="linear" stroke="var(--color-value)" strokeWidth={2.5} dot={false} activeDot={{ r: 4.5 }} />
                <ReferenceDot
                  x={data.at(-1)!.label}
                  y={res.last}
                  r={5.5}
                  fill={dotColor}
                  stroke="var(--card)"
                  strokeWidth={2.5}
                  ifOverflow="visible"
                  label={{ value: fmt(res.last), position: "right", offset: 10, fontSize: 12, fill: "var(--foreground)" }}
                />
              </ComposedChart>
            </ChartContainer>

            <div className="mt-6">
              <div className="label-mono mb-2">The change against the normal swing</div>
              <ChartContainer config={{ change: { label: "Change", color: INK } } satisfies ChartConfig} className="aspect-auto h-[64px] w-full">
                <BarChart
                  data={[{ name: "change", change: res.change }]}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 16, bottom: 0 }}
                  barSize={14}
                >
                  <XAxis
                    type="number"
                    {...axis}
                    domain={[-Math.max(Math.abs(res.change), res.swing) * 1.15, Math.max(Math.abs(res.change), res.swing) * 1.15]}
                    ticks={[-res.swing, 0, res.swing, ...(Math.abs(res.change) > res.swing * 1.5 ? [res.change] : [])].sort((a, b) => a - b)}
                    tickFormatter={(v: number) => (v > 0 ? `+${fmtDelta(v)}` : v === 0 ? "0" : fmtDelta(v))}
                  />
                  <YAxis type="category" dataKey="name" hide />
                  <ReferenceArea x1={-res.swing} x2={res.swing} fill="var(--band)" fillOpacity={1} ifOverflow="extendDomain" />
                  <ReferenceLine x={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
                  <Bar dataKey="change" radius={4} fill={Math.abs(res.zChange) >= 2 ? (res.change > 0 ? "var(--up)" : "var(--down)") : INK} isAnimationActive />
                </BarChart>
              </ChartContainer>
              <p className="mt-1 text-[12px] text-muted-foreground">Grey: the swing two normal weeks produce (±2 × √2 σ).</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={copy}>
              <Link2 className="size-4" strokeWidth={1.5} /> Copy result link
            </Button>
            <Button asChild variant="outline">
              <a href={`https://x.com/intent/post?text=${encodeURIComponent(share)}&url=${encodeURIComponent("https://wowyoy.com/fluke")}`} target="_blank" rel="noreferrer">
                Post on X
              </a>
            </Button>
            <Button asChild className="ml-auto max-sm:ml-0">
              <Link href="/connect">
                Run this on every metric, every Monday <ArrowUpRight className="size-4" strokeWidth={1.5} />
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid min-h-[300px] place-items-center rounded-lg border border-dashed border-border p-8 text-center text-[14px] text-muted-foreground">
          Paste at least {FLUKE_MIN_WEEKS} weeks to get a verdict.
        </div>
      )}
    </div>
  )
}
