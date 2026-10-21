import { createHash } from "node:crypto"
import type { MetricWeek } from "@workspace/metrics"
import { weeklySeries } from "@workspace/sources"
import type { Workspace } from "./session"

/**
 * Two years of weekly measures per connected project, kept in memory for 15 minutes.
 * Last week only changes once a week; this just stops every page view from re-querying PostHog.
 */

const TTL = 15 * 60 * 1000
const cache = new Map<string, { at: number; rows: Promise<MetricWeek[]> }>()

function cacheKey(ws: Workspace) {
  return createHash("sha256").update(JSON.stringify([ws.host, ws.projectId, ws.apiKey, ws.mapping])).digest("hex")
}

export function loadSeries(ws: Workspace, fresh = false) {
  const k = cacheKey(ws)
  const hit = cache.get(k)
  if (hit && !fresh && Date.now() - hit.at < TTL) return hit.rows
  const rows = weeklySeries({ host: ws.host, projectId: ws.projectId, apiKey: ws.apiKey }, ws.mapping)
  cache.set(k, { at: Date.now(), rows })
  rows.catch(() => cache.delete(k))
  if (cache.size > 200) cache.delete(cache.keys().next().value!)
  return rows
}
