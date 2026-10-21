import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { absolute, paths } from "@workspace/compiler"
import { Button } from "@workspace/ui/components/button"
import { Prompt } from "@workspace/ui/brand/prompt"
import { cn } from "@workspace/ui/lib/utils"
import { CopyButton } from "./copy-button"

const item =
  "inline-flex h-8 items-center px-2.5 font-mono text-[12px] text-muted-foreground transition-colors duration-[80ms] hover:bg-accent hover:text-foreground"

/** The same spec for machines: the file twins, the MCP server and the query, one click each. */
export function GetThisAs({ id, query, className }: { id: string; query: string | null; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <span className="label-mono">Get this as</span>
      <div className="flex flex-wrap items-center overflow-hidden rounded-md border border-border bg-card max-sm:w-full">
        {(["md", "json", "yaml"] as const).map((ext) => (
          <a key={ext} href={paths.metricFile(id, ext)} className={cn(item, "border-r border-border")}>
            .{ext}
          </a>
        ))}
        <CopyButton
          text={absolute(paths.mcp())}
          label="MCP"
          copiedLabel="Copied"
          icon={false}
          title="Copy the MCP server URL. Its define tool returns this spec."
          className={cn(item, "rounded-none", query && "border-r border-border")}
        />
        {query && <CopyButton text={query} label="Query" copiedLabel="Copied" className={cn(item, "rounded-none")} aria-label="Copy the HogQL query" />}
      </div>
    </div>
  )
}

/** The one call to action on every free surface. */
export function ConnectCta({ command = "weekly_read", flags = "--every monday" }: { command?: string; flags?: string }) {
  return (
    <section className="border-t border-border py-12 sm:py-16">
      <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <Prompt command={command} flags={flags} className="mb-3" />
          <p className="max-w-xl text-[21px] leading-snug tracking-[-0.01em] text-balance">
            wowyoy runs these checks on every metric you have, every Monday, and says which moves are real.
          </p>
        </div>
        <Button asChild size="lg" className="h-10 shrink-0 px-4 text-[14px]">
          <Link href="/connect">
            Run this on every metric, every Monday <ArrowRight className="size-4" strokeWidth={1.5} />
          </Link>
        </Button>
      </div>
    </section>
  )
}
