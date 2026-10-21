"use client"

import * as React from "react"
import { ArrowLeft, ArrowUpRight, LoaderCircle } from "lucide-react"
import { mappedMeasures, type Mapping } from "@workspace/sources"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Prompt } from "@workspace/ui/brand/prompt"
import { cn } from "@workspace/ui/lib/utils"
import { Field } from "@/components/field"
import { MappingList } from "@/components/mapping/mapping-list"
import { Segmented } from "@/components/segmented"
import { connectAction, currentDiscoveryAction, discoverAction, saveMappingAction, type Creds, type Discovery } from "./actions"

const regions = [
  { value: "us", label: "US cloud" },
  { value: "eu", label: "EU cloud" },
  { value: "custom", label: "Self-hosted" },
] as const

const keyPage = { us: "https://us.posthog.com/settings/user-api-keys", eu: "https://eu.posthog.com/settings/user-api-keys" }

function Steps({ step }: { step: 1 | 2 | 3 }) {
  const items = ["Connect", "Review mapping", "Read your history"]
  return (
    <ol className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px]">
      {items.map((s, k) => (
        <li key={s} className={cn("flex items-center gap-2", k + 1 === step ? "text-foreground" : "text-muted-foreground")} aria-current={k + 1 === step ? "step" : undefined}>
          <span className={cn("grid size-5 place-items-center rounded-full border text-[11px]", k + 1 === step ? "border-foreground" : "border-border", k + 1 < step && "border-up bg-up text-background")}>
            {k + 1 < step ? "✓" : k + 1}
          </span>
          {s}
        </li>
      ))}
    </ol>
  )
}

export function ConnectFlow({ edit, serverClaude, canStore }: { edit: boolean; serverClaude: boolean; canStore: boolean }) {
  const [creds, setCreds] = React.useState<Creds>({ region: "us", customHost: "", projectId: "", apiKey: "", anthropicKey: "" })
  const [found, setFound] = React.useState<Discovery | null>(null)
  const [mapping, setMapping] = React.useState<Mapping | null>(null)
  const [error, setError] = React.useState<{ error: string; field?: string } | null>(null)
  const [pending, start] = React.useTransition()
  const [loadingEdit, setLoadingEdit] = React.useState(edit)

  React.useEffect(() => {
    if (!edit) return
    currentDiscoveryAction().then((r) => {
      setLoadingEdit(false)
      if (r.ok) {
        setFound(r)
        setMapping(r.mapping)
      } else setError(r)
    })
  }, [edit])

  const discover = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const r = await discoverAction(creds)
      if (!r.ok) return setError(r)
      setFound(r)
      setMapping(r.mapping)
      window.scrollTo({ top: 0 })
    })
  }

  const save = () => {
    if (!found || !mapping) return
    setError(null)
    start(async () => {
      const r = edit ? await saveMappingAction({ mapping }) : await connectAction({ ...creds, project: found.project, mapping, mappedBy: found.mappedBy })
      // Success redirects; we only get here on failure.
      if (r && !r.ok) setError(r)
    })
  }

  const step = pending && found ? 3 : found ? 2 : 1
  const mappedCount = mapping ? mappedMeasures.filter((m) => mapping[m]).length : 0

  if (!canStore) {
    return (
      <div className="mt-10 rounded-lg border border-border bg-card p-6">
        <p className="text-[15px] font-medium">This deployment can&apos;t store a connection yet.</p>
        <p className="mt-2 text-[14px] text-muted-foreground">
          Set <code className="font-mono text-foreground">WOWYOY_SECRET</code> to a long random string in the environment and redeploy. It encrypts the cookie
          that holds your PostHog key.
        </p>
      </div>
    )
  }

  if (loadingEdit) {
    return (
      <p className="mt-10 flex items-center gap-2 text-[14px] text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Reading your events…
      </p>
    )
  }

  return (
    <div className="mt-8">
      <Steps step={step} />

      {!found ? (
        <form onSubmit={discover} className="mt-8 grid gap-6 rounded-lg border border-border bg-card p-6" noValidate>
          <Field label="Where your PostHog lives" error={error?.field === "host" ? error.error : null}>
            <Segmented label="Region" value={creds.region} options={[...regions]} onChange={(region) => setCreds({ ...creds, region })} />
            {creds.region === "custom" && (
              <Input
                aria-label="PostHog host"
                placeholder="https://posthog.yourcompany.com"
                value={creds.customHost}
                onChange={(e) => setCreds({ ...creds, customHost: e.target.value })}
                className="mt-2 h-9 font-mono"
                autoComplete="url"
              />
            )}
          </Field>
          <Field
            label="Personal API key"
            htmlFor="apiKey"
            error={error?.field === "apiKey" ? error.error : null}
            hint={
              <>
                Starts with <span className="font-mono">phx_</span>. Give it read access to Project and Query only.{" "}
                {creds.region !== "custom" && (
                  <a href={keyPage[creds.region]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-foreground underline underline-offset-4">
                    Create one <ArrowUpRight className="size-3" />
                  </a>
                )}
              </>
            }
          >
            <Input
              id="apiKey"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="phx_…"
              value={creds.apiKey}
              onChange={(e) => setCreds({ ...creds, apiKey: e.target.value })}
              aria-invalid={error?.field === "apiKey" || undefined}
              className="h-9 font-mono"
            />
          </Field>
          <Field
            label="Project id"
            htmlFor="projectId"
            error={error?.field === "projectId" ? error.error : null}
            hint="Optional. The number after /project/ in your PostHog URL. Leave blank for the key's current project."
          >
            <Input
              id="projectId"
              inputMode="numeric"
              placeholder="41208"
              value={creds.projectId}
              onChange={(e) => setCreds({ ...creds, projectId: e.target.value })}
              aria-invalid={error?.field === "projectId" || undefined}
              className="h-9 max-w-[200px] font-mono"
            />
          </Field>
          {!serverClaude && (
            <Field
              label="Anthropic API key"
              htmlFor="anthropicKey"
              hint="Optional. Claude reads your event names once and proposes the mapping. Without a key, wowyoy matches common event names and you check them."
            >
              <Input
                id="anthropicKey"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-ant-…"
                value={creds.anthropicKey}
                onChange={(e) => setCreds({ ...creds, anthropicKey: e.target.value })}
                className="h-9 font-mono"
              />
            </Field>
          )}
          {error && !error.field && (
            <p className="text-[13px] text-down" role="alert">
              {error.error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
            <p className="max-w-md text-[12.5px] leading-snug text-muted-foreground">
              Read-only. Your key is encrypted in a cookie on this browser and only used to run fixed weekly queries.
            </p>
            <Button type="submit" size="lg" disabled={pending} className="px-4">
              {pending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" /> {serverClaude || creds.anthropicKey ? "Reading events, Claude is mapping…" : "Reading events…"}
                </>
              ) : (
                "Read my events"
              )}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Prompt command="setup" flags={`--project ${found.project.id} --review`} className="mb-2" />
              <h2 className="pixel-33 text-balance">
                {found.project.name}: {found.events.length} events, {mappedCount} mapped.
              </h2>
              <p className="mt-2 max-w-2xl text-[14px] text-muted-foreground">
                {found.mappedBy === "claude" ? "Claude proposed these from your event names and properties." : "These come from matching common event names."}{" "}
                Check the ones under 0.75 and change anything that's wrong. Each one compiles to the fixed query shown under it.
              </p>
              {found.notes && <p className="mt-3 max-w-2xl border-l-2 border-foreground pl-3 text-[13.5px]">{found.notes}</p>}
            </div>
          </div>
          <div className="mt-6">{mapping && <MappingList mapping={mapping} events={found.events} onChange={setMapping} />}</div>
          {error && (
            <p className="mt-4 text-[13px] text-down" role="alert">
              {error.error}
            </p>
          )}
          <div className="sticky bottom-0 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/90 py-4 backdrop-blur">
            {!edit ? (
              <Button variant="ghost" onClick={() => setFound(null)} disabled={pending}>
                <ArrowLeft className="size-4" strokeWidth={1.5} /> Back
              </Button>
            ) : (
              <span />
            )}
            <Button size="lg" onClick={save} disabled={pending || (!mapping?.sessions && !mapping?.orders)} className="px-4">
              {pending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" /> Reading two years of Mondays…
                </>
              ) : edit ? (
                "Save mapping"
              ) : (
                "Looks right, read my history"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
