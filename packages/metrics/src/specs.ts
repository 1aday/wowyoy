import { aliasSlug, metricSpecSchema, type MetricSpec } from "./spec"
import { specSources } from "./specs.generated"

/**
 * The Standard's specs, parsed once. Publishing rule: a spec is public only once
 * reviewed (reviewed_by set). Preview and local builds may show drafts, marked as
 * drafts and never indexed; production never does.
 */

let cache: MetricSpec[] | null = null

export function allSpecs(): MetricSpec[] {
  if (!cache) cache = Object.values(specSources).map((s) => metricSpecSchema.parse(s.data))
  return cache
}

export function specYaml(id: string): string | null {
  return specSources[id]?.yaml ?? null
}

export const isReviewed = (s: Pick<MetricSpec, "reviewed_by">) => !!s.reviewed_by

/** Whether unreviewed specs render on this deployment (as drafts, noindex). */
export function draftsVisible(env: Record<string, string | undefined> = process.env) {
  if (env.WOWYOY_SHOW_DRAFTS === "1") return true
  if (env.WOWYOY_SHOW_DRAFTS === "0") return false
  return env.VERCEL_ENV !== "production"
}

/** The specs this deployment publishes, in family then name order. */
export function publishedSpecs(env?: Record<string, string | undefined>): MetricSpec[] {
  const show = draftsVisible(env)
  return allSpecs().filter((s) => show || isReviewed(s))
}

export function specById(id: string, env?: Record<string, string | undefined>): MetricSpec | null {
  return publishedSpecs(env).find((s) => s.id === id) ?? null
}

/** Alias slug → spec id, for 301s from other names to the one canonical page. */
export function aliasRedirects(env?: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const s of publishedSpecs(env)) {
    for (const a of s.aliases) {
      const as = aliasSlug(a)
      if (as && as !== s.id) out[as] = s.id
    }
  }
  return out
}
