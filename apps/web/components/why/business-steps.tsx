import Link from "next/link"
import { ArrowRight, ChevronRight } from "lucide-react"
import type { BusinessStep } from "@workspace/compiler"
import type { MetricSpec } from "@workspace/metrics"
import { QueryTabs } from "@/components/standard/query-tabs"
import { queryNotes } from "@/lib/standard/pages"
import { lowerName } from "@/lib/standard/spec-view"

/** Step 3 of a Why page: the driver tree walked in diagnose order, each check with its query (collapsed) and its page. */
export function BusinessSteps({ spec, steps }: { spec: MetricSpec; steps: BusinessStep[] }) {
  return (
    <ol className="border-t border-border" data-testid="business-steps">
      {steps.map((s) => {
        const what =
          s.queryKind === "breakdown"
            ? `${spec.name} by ${s.driver.breakdown}`
            : s.queryKind === "metric" && s.link
              ? s.link.name
              : null
        return (
          <li key={s.driver.id} className="grid border-b border-border py-7 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-x-4">
            <span className="num pt-[3px] text-[13px] text-muted-foreground max-sm:hidden">3.{s.n}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-[14px] font-medium">
                  <span className="num mr-2.5 text-[13px] font-normal text-muted-foreground sm:hidden">3.{s.n}</span>
                  {s.driver.label}
                </h3>
                {s.driver.breakdown && <span className="font-mono text-[11.5px] text-muted-foreground">by {s.driver.breakdown}</span>}
                {s.driver.feed && <span className="font-mono text-[11.5px] text-muted-foreground">world · {s.driver.feed}</span>}
              </div>
              <p className="mt-2 max-w-3xl text-[18px] leading-snug tracking-[-0.005em] text-pretty">{s.check}</p>
              <div className="mt-3 max-w-3xl text-[14.5px] leading-relaxed">
                <span className="label-mono mr-2">A yes looks like</span>
                <span className="text-muted-foreground">{s.yes}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                {s.queries && what ? (
                  <details className="group/q w-full">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-mono text-[12.5px] text-muted-foreground transition-colors duration-[80ms] select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="size-3.5 transition-transform duration-[160ms] group-open/q:rotate-90" strokeWidth={1.5} aria-hidden />
                      Query · {what}
                    </summary>
                    <QueryTabs className="mt-3" queries={s.queries} notes={queryNotes(false)} label={`${what} query`} />
                  </details>
                ) : (
                  <span className="font-mono text-[12.5px] text-muted-foreground">
                    {s.driver.metric && !s.link
                      ? `Query: comes with the ${s.driver.metric} spec, in review.`
                      : "No query: this check is read outside the event data."}
                  </span>
                )}
              </div>
              {s.link && (
                <Link href={s.link.path} className="group mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-medium underline-offset-4 hover:underline">
                  {s.link.name}: definition, query and normal range
                  <ArrowRight className="size-3.5 transition-transform duration-[160ms] group-hover:translate-x-0.5" strokeWidth={1.5} />
                </Link>
              )}
            </div>
          </li>
        )
      })}
      {steps.length === 0 && (
        <li className="py-6 text-[15px] text-muted-foreground">This metric&apos;s drivers aren&apos;t written yet. Start with {lowerName(spec.name)}&apos;s own query.</li>
      )}
    </ol>
  )
}
