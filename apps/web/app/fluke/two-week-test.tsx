"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Prompt } from "@workspace/ui/brand/prompt"
import { Field } from "@/components/field"
import { Segmented } from "@/components/segmented"
import { CopyLink } from "@/components/fluke/copy-link"
import { Parts } from "@/components/fluke/parts"
import { TwoWeekChart } from "@/components/fluke/two-week-chart"
import { TwoWeekFields } from "@/components/fluke/two-week-fields"
import {
  fromText,
  kindHelp,
  kindInfo,
  plain,
  runTwoWeek,
  toText,
  twoWeekKinds,
  twoWeekPresets,
  type TwoWeekText,
} from "@/lib/fluke/two-week"

/** Two numbers and a volume: judged against the sampling floor only, and the page says so. */
export function TwoWeekTest({ text, setText, onHistory }: { text: TwoWeekText; setText: (t: TwoWeekText) => void; onHistory: () => void }) {
  const { values, errors } = React.useMemo(() => fromText(text), [text])
  const report = React.useMemo(() => (values ? runTwoWeek(values) : null), [values])
  const ok = report && !("error" in report) ? report : null
  const problem = report && "error" in report ? report.error : null

  // Keep the URL shareable: the path reproduces the result.
  const path = ok?.path
  React.useEffect(() => {
    if (!path) return
    const t = setTimeout(() => window.history.replaceState(null, "", path), 300)
    return () => clearTimeout(t)
  }, [path])

  const v = ok?.values
  const flags = v ? `--two-weeks --${v.kind}${v.volume ? ` --volume ${v.volume}` : ""}` : "--two-weeks"
  const share = ok ? `${ok.headline} ${plain(ok.explain.at(-1) ?? [])}` : ""

  return (
    <div className="mt-5 grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <div className="grid gap-5 rounded-lg border border-border bg-card p-5">
        <Field label="What kind of number" hint={kindHelp[text.kind]}>
          <Segmented
            label="Kind"
            value={text.kind}
            options={twoWeekKinds.map((k) => ({ value: k, label: kindInfo[k].label }))}
            onChange={(k) => setText(toText(twoWeekPresets[k]))}
          />
        </Field>
        <TwoWeekFields id="fl2" text={text} onChange={setText} errors={errors} />
        <div className="border-l-2 border-foreground pl-3 text-[12.5px] leading-relaxed">
          <div className="mb-1 label-mono">How it judges</div>
          Counting a limited number of visitors or orders makes every weekly number wobble. For a rate over n trials one week&apos;s wobble
          is σ = √(p(1−p)/n); for a count of N it is √N; for money over N orders it also grows with how much orders vary. Two weeks both
          wobble, so a change has to clear 2 × √2 σ before it counts. Chance crosses that line about once in 22 weeks.
        </div>
      </div>

      {ok ? (
        <div className="grid min-w-0 gap-6">
          <div className="min-w-0 rounded-lg border border-border bg-card p-5 sm:p-6">
            <Prompt command="fluke_test" flags={flags} className="mb-3 truncate" />
            <h2 className="pixel-46 text-balance max-sm:pixel-33" data-testid="fluke-verdict">
              {ok.headline}
              <span className="cursor-block" aria-hidden />
            </h2>
            <div className="mt-4 grid max-w-[68ch] gap-1.5 text-[15.5px] leading-relaxed">
              {ok.explain.map((s, i) => (
                <p key={i}>
                  <Parts parts={s} significant={ok.significant} />
                </p>
              ))}
            </div>
            {ok.floor ? <TwoWeekChart report={ok} className="mt-6" label={kindInfo[ok.values.kind].label} /> : null}
            <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">{ok.caveat}</p>
              <Button variant="outline" size="sm" className="shrink-0 self-start sm:self-center" onClick={onHistory}>
                Paste history
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <CopyLink />
            <Button asChild variant="outline">
              <a
                href={`https://x.com/intent/post?text=${encodeURIComponent(share)}&url=${encodeURIComponent(`https://wowyoy.com${ok.path}`)}`}
                target="_blank"
                rel="noreferrer"
              >
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
          {problem ?? "Enter both weeks to get a verdict."}
        </div>
      )}
    </div>
  )
}
