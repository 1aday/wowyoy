import type { Metadata } from "next"
import { Prompt } from "@workspace/ui/brand/prompt"
import { SiteHeader } from "@/components/site-header"
import { canStoreConnections, readWorkspace } from "@/lib/session"
import { ConnectFlow } from "./connect-flow"

export const metadata: Metadata = { title: "Connect PostHog", robots: { index: false } }

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams
  const ws = await readWorkspace()
  const editing = edit === "1" && !!ws
  return (
    <>
      <SiteHeader current="connect" connected={!!ws} />
      <main className="mx-auto max-w-4xl px-4 pt-12 pb-24 sm:px-8">
        <Prompt command="setup" flags="--source posthog" className="mb-4" />
        <h1 className="pixel-46 text-balance max-sm:pixel-33">{editing ? "Edit the mapping." : "Connect PostHog."}</h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          {editing
            ? "Change which event each measure reads. Saving re-reads your history with the new queries."
            : "wowyoy reads your events once to map them, then reads weekly totals with fixed queries. It never writes to PostHog. Two years of Mondays appear the moment you finish."}
        </p>
        <ConnectFlow edit={editing} serverClaude={!!process.env.ANTHROPIC_API_KEY} canStore={canStoreConnections()} />
      </main>
    </>
  )
}
