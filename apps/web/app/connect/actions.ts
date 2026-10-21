"use server"

import { redirect } from "next/navigation"
import {
  discover,
  getProject,
  mappingSchema,
  normalizeHost,
  posthogHosts,
  PostHogError,
  ruleMapping,
  weeklySeries,
  type DiscoveredEvent,
  type Mapping,
  type PostHogConfig,
} from "@workspace/sources"
import { claudeMapping } from "@workspace/sources/claude"
import { z } from "zod"
import { allowPrivateHosts, clearWorkspace, readWorkspace, writeWorkspace, type Workspace } from "@/lib/session"
import { loadSeries } from "@/lib/series"

const credsSchema = z.object({
  region: z.enum(["us", "eu", "custom"]),
  customHost: z.string().max(300).optional(),
  projectId: z.string().max(40).optional(),
  apiKey: z.string().max(200),
  anthropicKey: z.string().max(300).optional(),
})
export type Creds = z.infer<typeof credsSchema>

type Fail = { ok: false; error: string; field?: "host" | "projectId" | "apiKey" | "anthropicKey" }

function config(c: Creds): PostHogConfig {
  const host = c.region === "custom" ? normalizeHost(c.customHost ?? "", allowPrivateHosts) : posthogHosts[c.region]
  const projectId = c.projectId?.trim() || "@current"
  if (!/^(@current|\d+)$/.test(projectId)) throw new PostHogError("The project id is the number in your PostHog URL, like 41208.")
  return { host, projectId, apiKey: c.apiKey.trim() }
}

function fail(e: unknown): Fail {
  if (e instanceof PostHogError) {
    const field = e.status === 401 ? "apiKey" : e.status === 404 ? "projectId" : /host|https|reach/i.test(e.message) ? "host" : undefined
    return { ok: false, error: e.message, field }
  }
  console.error(e)
  return { ok: false, error: "Something went wrong reading PostHog. Try again." }
}

export interface Discovery {
  ok: true
  project: { id: string; name: string; timezone: string }
  events: DiscoveredEvent[]
  mapping: Mapping
  mappedBy: "claude" | "rules"
  notes: string
}

/** Step 1: read the project's events and propose a mapping (rules first, then Claude if a key is available). */
export async function discoverAction(input: Creds): Promise<Discovery | Fail> {
  const parsed = credsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Fill in the PostHog key." }
  if (!parsed.data.apiKey.trim()) return { ok: false, error: "Paste a personal API key.", field: "apiKey" }
  try {
    const cfg = config(parsed.data)
    const project = await getProject(cfg)
    const events = await discover({ ...cfg, projectId: project.id })
    if (!events.length) return { ok: false, error: "This project has no events in the last 30 days.", field: "projectId" }
    const rules = ruleMapping(events)
    const anthropicKey = parsed.data.anthropicKey?.trim() || process.env.ANTHROPIC_API_KEY
    if (anthropicKey) {
      try {
        const claude = await claudeMapping(events, rules, anthropicKey)
        return { ok: true, project, events, mapping: claude.mapping, mappedBy: "claude", notes: claude.notes }
      } catch (e) {
        console.error("claude mapping failed", e)
        return {
          ok: true,
          project,
          events,
          mapping: rules,
          mappedBy: "rules",
          notes: "Claude couldn't be reached, so these come from name matching. Check each one.",
        }
      }
    }
    return { ok: true, project, events, mapping: rules, mappedBy: "rules", notes: "" }
  } catch (e) {
    return fail(e)
  }
}

/** Step 2: save the reviewed mapping, read two years once to prove it works, and open the workspace. */
export async function connectAction(input: Creds & { project: Discovery["project"]; mapping: Mapping; mappedBy: "claude" | "rules" }) {
  const parsed = credsSchema.safeParse(input)
  const mapping = mappingSchema.safeParse(input.mapping)
  if (!parsed.success || !mapping.success) return { ok: false, error: "That mapping isn't valid." } satisfies Fail
  if (!mapping.data.sessions && !mapping.data.orders) return { ok: false, error: "Map at least sessions or orders." } satisfies Fail
  let ws: Workspace
  try {
    const cfg = { ...config(parsed.data), projectId: input.project.id }
    const rows = await weeklySeries(cfg, mapping.data)
    if (rows.length < 2) return { ok: false, error: "Those events have less than two weeks of history. Check the mapping." } satisfies Fail
    ws = {
      v: 1,
      host: cfg.host,
      projectId: input.project.id,
      projectName: input.project.name,
      timezone: input.project.timezone,
      apiKey: cfg.apiKey,
      mapping: mapping.data,
      mappedBy: input.mappedBy,
      connectedAt: new Date().toISOString(),
    }
    await writeWorkspace(ws)
  } catch (e) {
    return fail(e)
  }
  redirect("/app")
}

export async function disconnectAction() {
  await clearWorkspace()
  redirect("/")
}

export async function refreshAction() {
  const ws = await readWorkspace()
  if (ws) await loadSeries(ws, true).catch(() => null)
  redirect("/app")
}

/** Editing an existing connection: the key stays server-side, in the cookie. */
export async function currentDiscoveryAction(): Promise<Discovery | Fail> {
  const ws = await readWorkspace()
  if (!ws) return { ok: false, error: "Not connected." }
  try {
    const events = await discover({ host: ws.host, projectId: ws.projectId, apiKey: ws.apiKey })
    return {
      ok: true,
      project: { id: ws.projectId, name: ws.projectName, timezone: ws.timezone },
      events,
      mapping: ws.mapping,
      mappedBy: ws.mappedBy,
      notes: "",
    }
  } catch (e) {
    return fail(e)
  }
}

export async function saveMappingAction(input: { mapping: Mapping }) {
  const ws = await readWorkspace()
  const mapping = mappingSchema.safeParse(input.mapping)
  if (!ws || !mapping.success) return { ok: false, error: "That mapping isn't valid." } satisfies Fail
  try {
    const rows = await weeklySeries({ host: ws.host, projectId: ws.projectId, apiKey: ws.apiKey }, mapping.data)
    if (rows.length < 2) return { ok: false, error: "Those events have less than two weeks of history." } satisfies Fail
    await writeWorkspace({ ...ws, mapping: mapping.data })
  } catch (e) {
    return fail(e)
  }
  redirect("/app?view=mapping")
}
