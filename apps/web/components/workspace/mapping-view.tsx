"use client"

import Link from "next/link"
import { completeWeeks, mappedMeasures, newCustomersQuery, weeklyQuery, type DiscoveredEvent, type Mapping } from "@workspace/sources"
import type { MetricWeek } from "@workspace/metrics"
import { Button } from "@workspace/ui/components/button"
import { Prompt } from "@workspace/ui/brand/prompt"
import { disconnectAction, refreshAction } from "@/app/connect/actions"
import { MappingList } from "@/components/mapping/mapping-list"
import type { Source } from "./workspace"

export function MappingView({ source, mapping, rows }: { source: Source; mapping: Mapping; events?: DiscoveredEvent[]; rows: MetricWeek[] }) {
  const mapped = mappedMeasures.filter((m) => mapping[m])
  const events = new Set(mapped.map((m) => mapping[m]!.event))
  const metrics = new Set(rows.flatMap((r) => Object.keys(r.values))).size
  const window = completeWeeks(105)
  const query = weeklyQuery(mapping, window)
  const firsts = mapping.orders && mapping.newCustomers ? newCustomersQuery(mapping.orders, window) : null
  const by = source.kind === "posthog" ? (source.mappedBy === "claude" ? "Claude" : "name matching") : "Claude"

  return (
    <section className="pt-10">
      <Prompt command="mapping" flags={`--source ${source.kind === "sample" ? "sample" : "posthog"} --review`} className="mb-6" />
      <h1 className="pixel-46 max-w-4xl text-balance max-sm:pixel-33">
        {events.size} events, {metrics} metrics, {rows.length} weeks read.
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        {by === "Claude" ? "Claude" : "Name matching"} proposed each mapping once, at setup, and you reviewed it. It compiled to the fixed
        queries below. Nothing is re-interpreted on Mondays, and no model writes a number.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {source.kind === "posthog" ? (
          <>
            <Button asChild variant="outline">
              <Link href="/connect?edit=1">Edit mapping</Link>
            </Button>
            <form action={refreshAction}>
              <Button variant="outline" type="submit">
                Re-read PostHog
              </Button>
            </form>
            <form action={disconnectAction}>
              <Button variant="ghost" type="submit" className="text-muted-foreground">
                Disconnect
              </Button>
            </form>
          </>
        ) : (
          <Button asChild>
            <Link href="/connect">Connect your PostHog</Link>
          </Button>
        )}
      </div>

      <div className="mt-8">
        <MappingList mapping={mapping} />
      </div>

      {query && (
        <details className="group mt-8 rounded-lg border border-border bg-card">
          <summary className="cursor-pointer list-none px-5 py-3 text-[14px] font-medium select-none">
            <span className="mr-2 inline-block font-mono text-muted-foreground transition-transform duration-[160ms] group-open:rotate-90">›</span>
            The weekly query, exactly as it runs
          </summary>
          <pre className="overflow-x-auto border-t border-border px-5 py-4 font-mono text-[12px] leading-relaxed text-muted-foreground">
            {query}
            {firsts ? `\n\n-- new customers\n${firsts}` : ""}
          </pre>
        </details>
      )}
      {source.kind === "posthog" && (
        <p className="mt-6 font-mono text-[12px] text-muted-foreground">
          {source.host} · project {source.projectId} · connected {source.connectedAt.slice(0, 10)}
        </p>
      )}
    </section>
  )
}
