"use client"

import * as React from "react"
import Link from "next/link"
import { exampleBusinesses } from "@workspace/metrics/example"
import { flukeTest } from "@workspace/metrics/fluke"
import { DOWN, UP } from "@workspace/metrics/format"
import { Prompt } from "@workspace/ui/brand/prompt"
import { cn } from "@workspace/ui/lib/utils"
import type { WhyDirection } from "@workspace/compiler/site"
import { Field } from "@/components/field"
import { formatSpecValue, inSentence, specUnit, type EmbedPrefill, type EmbedSpec } from "@/lib/fluke/embed"
import { parseNumber } from "@/lib/fluke/number"
import { fromText, runTwoWeek, toText, type Part, type TwoWeekText } from "@/lib/fluke/two-week"
import { HistoryMiniChart } from "./history-mini-chart"
import { Parts } from "./parts"
import { TwoWeekChart } from "./two-week-chart"
import { TwoWeekFields } from "./two-week-fields"
import { UnitInput } from "./unit-input"

type CardSpec = Pick<EmbedSpec, "id" | "name" | "kind" | "example">

function question(name: string, direction?: WhyDirection) {
  const n = inSentence(name)
  return direction === "dropped" ? `Did ${n} really drop?` : direction === "spiked" ? `Did ${n} really spike?` : `Is a move in ${n} real?`
}

/** The interactive card behind FlukeEmbed. Everything it needs arrives as plain data from the server. */
export function FlukeEmbedCard({
  spec,
  prefill,
  direction,
  className,
}: {
  spec: CardSpec
  prefill: EmbedPrefill
  direction?: WhyDirection
  className?: string
}) {
  const business = exampleBusinesses[spec.example.business]
  return (
    <section
      aria-label={`Fluke Test: ${spec.name}`}
      className={cn("@container overflow-hidden rounded-xl border border-border bg-card", className)}
    >
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Prompt command="fluke_test" flags={`--metric ${spec.id}`} className="min-w-0 truncate" />
          <span className="label-mono">Example numbers</span>
        </div>
        <h3 className="mt-3 text-[17px] leading-snug font-medium">{question(spec.name, direction)}</h3>
        <p className="mt-1 text-[13.5px] leading-snug text-muted-foreground">
          Pre-filled for {business.name}, {business.what}. Type your own weeks.
        </p>
      </div>
      {prefill.mode === "two-weeks" ? <TwoWeekBody spec={spec} prefill={prefill} /> : <ProcessBody spec={spec} prefill={prefill} />}
    </section>
  )
}

function Layout({
  fields,
  answer,
  chart,
  note,
}: {
  fields: React.ReactNode
  answer: React.ReactNode
  chart: React.ReactNode
  note: React.ReactNode
}) {
  return (
    <>
      <div className="grid gap-6 px-5 pt-5 pb-6 sm:px-6 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] @2xl:gap-8">
        <div className="@container grid content-start gap-6">
          {fields}
          {answer}
        </div>
        <div className="min-w-0 @2xl:self-center">{chart}</div>
      </div>
      {/* The page around the embed carries the call to connect; the embed only explains itself. */}
      <div className="border-t border-border px-5 py-4 sm:px-6">
        <p className="max-w-[72ch] text-[12.5px] leading-relaxed text-muted-foreground">{note}</p>
      </div>
    </>
  )
}

function Answer({ headline, sentences, significant }: { headline: string; sentences: Part[][]; significant: boolean }) {
  return (
    <div aria-live="polite">
      <p className="pixel-33 text-balance" data-testid="fluke-embed-verdict">
        {headline}
        <span className="cursor-block" aria-hidden />
      </p>
      <div className="mt-3 grid gap-1 text-[14.5px] leading-relaxed">
        {sentences.map((s, i) => (
          <p key={i}>
            <Parts parts={s} significant={significant} />
          </p>
        ))}
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-4 text-[13.5px] text-muted-foreground">{children}</p>
}

function TwoWeekBody({ spec, prefill }: { spec: CardSpec; prefill: Extract<EmbedPrefill, { mode: "two-weeks" }> }) {
  const [text, setText] = React.useState<TwoWeekText>(() => toText(prefill.values))
  const { values, errors } = React.useMemo(() => fromText(text), [text])
  const report = React.useMemo(() => (values ? runTwoWeek(values, { volumeUnit: prefill.volumeUnit }) : null), [values, prefill.volumeUnit])
  const ok = report && !("error" in report) ? report : null
  return (
    <Layout
      fields={<TwoWeekFields id={`fe-${spec.id}`} text={text} onChange={setText} errors={errors} volumeLabel={prefill.volumeLabel} row />}
      answer={
        ok ? (
          <Answer headline={ok.headline} sentences={ok.explain} significant={ok.significant} />
        ) : (
          <Empty>{report && "error" in report ? report.error : "Enter both weeks to get a verdict."}</Empty>
        )
      }
      chart={ok?.floor ? <TwoWeekChart report={ok} label={spec.name} className="h-[200px] @2xl:h-[240px]" /> : null}
      note={
        <>
          Two numbers test only the sampling floor. A metric&apos;s own week-to-week swing is often wider, so{" "}
          <Link href="/fluke" className="text-foreground underline underline-offset-4 hover:no-underline">
            open the full Fluke Test
          </Link>{" "}
          and paste its history.
        </>
      }
    />
  )
}

function ProcessBody({ spec, prefill }: { spec: CardSpec; prefill: Extract<EmbedPrefill, { mode: "history" }> }) {
  const fmt = (v: number) => formatSpecValue(spec.kind, v)
  const unit = specUnit(spec.kind)
  const typed = (v: number) => (spec.kind === "rate" ? String(v) : v.toLocaleString("en-US", { maximumFractionDigits: 2 }))
  const [text, setText] = React.useState({ before: typed(prefill.before), after: typed(prefill.after) })
  const before = parseNumber(text.before)
  const after = parseNumber(text.after)
  const values = before != null && after != null ? [...prefill.history, before, after] : null
  const res = values ? flukeTest(values) : null
  const rate = spec.kind === "rate"
  const move = (x: number) => (rate ? `${Math.abs(x) < 1 ? Math.abs(x).toFixed(2) : Math.abs(x).toFixed(1)} pt` : fmt(Math.abs(x)))
  const sentences: Part[][] = res
    ? [
        [
          `With no sampling floor to test, ${inSentence(spec.name)} is judged by its own week-to-week swing. Normal weeks move up to `,
          { num: `±${move(res.swing)}` },
          ".",
        ],
        [
          "This move is ",
          res.change === 0
            ? { num: "zero" }
            : { num: `${res.change > 0 ? UP : DOWN}${move(res.change)}`, tone: res.change > 0 ? "up" : "down" },
          `, ${Math.abs(res.zChange).toFixed(1)}× the normal swing. ${res.advice}`,
        ],
      ]
    : []
  const u = rate ? "pct" : spec.kind === "currency" ? "usd" : ""
  const full = values ? `/fluke?${new URLSearchParams({ m: spec.name, v: values.join(","), ...(u ? { u } : {}) })}` : "/fluke"
  const err = (s: string, v: number | null) => (v == null ? (s.trim() ? "Not a number." : "Required.") : null)
  return (
    <Layout
      fields={
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Week before" htmlFor={`fe-${spec.id}-before`} error={err(text.before, before)}>
            <UnitInput
              id={`fe-${spec.id}-before`}
              unit={unit}
              value={text.before}
              onChange={(e) => setText({ ...text, before: e.target.value })}
            />
          </Field>
          <Field label="Last week" htmlFor={`fe-${spec.id}-after`} error={err(text.after, after)}>
            <UnitInput
              id={`fe-${spec.id}-after`}
              unit={unit}
              value={text.after}
              onChange={(e) => setText({ ...text, after: e.target.value })}
            />
          </Field>
        </div>
      }
      answer={
        res ? (
          <Answer headline={res.verdict} sentences={sentences} significant={Math.abs(res.zChange) >= 2} />
        ) : (
          <Empty>Enter both weeks to get a verdict.</Empty>
        )
      }
      chart={res && values ? <HistoryMiniChart values={values} res={res} format={fmt} label={spec.name} /> : null}
      note={
        <>
          Normal is read from {prefill.history.length} weeks of example history.{" "}
          <Link href={full} className="text-foreground underline underline-offset-4 hover:no-underline">
            Paste your own weeks
          </Link>{" "}
          to test your {inSentence(spec.name)}.
        </>
      }
    />
  )
}
