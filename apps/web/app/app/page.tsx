import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { Button } from "@workspace/ui/components/button"
import { Logo } from "@workspace/ui/brand/logo"
import { Prompt } from "@workspace/ui/brand/prompt"
import { Workspace } from "@/components/workspace/workspace"
import { disconnectAction, refreshAction } from "@/app/connect/actions"
import { readWorkspace } from "@/lib/session"
import { loadSeries } from "@/lib/series"

export const metadata: Metadata = { title: "Your Pulse", robots: { index: false } }

export default async function AppPage() {
  const ws = await readWorkspace()
  if (!ws) redirect("/connect")
  let rows
  try {
    rows = await loadSeries(ws)
  } catch (e) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-20">
        <Logo />
        <Prompt command="weekly_read" flags={`--source posthog --project ${ws.projectId}`} className="mt-12" />
        <h1 className="mt-4 pixel-46 text-balance max-sm:pixel-33">PostHog didn&apos;t answer.</h1>
        <p className="mt-4 text-[15px] text-muted-foreground">{(e as Error).message}</p>
        <div className="mt-8 flex flex-wrap gap-2">
          <form action={refreshAction}>
            <Button type="submit">Try again</Button>
          </form>
          <Button asChild variant="outline">
            <Link href="/connect?edit=1">Check the mapping</Link>
          </Button>
          <form action={disconnectAction}>
            <Button type="submit" variant="ghost" className="text-muted-foreground">
              Disconnect
            </Button>
          </form>
        </div>
      </main>
    )
  }
  return (
    <Suspense>
      <Workspace
        source={{ kind: "posthog", name: ws.projectName, projectId: ws.projectId, host: ws.host, mappedBy: ws.mappedBy, connectedAt: ws.connectedAt }}
        rows={rows}
        mapping={ws.mapping}
      />
    </Suspense>
  )
}
