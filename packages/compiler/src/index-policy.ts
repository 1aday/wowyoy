import { isReviewed, type MetricSpec } from "@workspace/metrics"
import { paths } from "./site"
import evidenceFile from "./evidence.json" with { type: "json" }

/**
 * The indexing rule, as code: a generated page is noindex until something links to it.
 * Page templates, the sitemap and X-Robots-Tag headers all ask `indexState`; nothing else decides.
 *
 * A generated page flips to indexed when all three hold:
 * 1. Its spec is reviewed, or (week and repo pages) its week is closed.
 * 2. It has a confirmed external inbound link, or 10 unique visitors in 28 days from outside wowyoy.
 * 3. It is not a result page (Fluke results and badges are never indexed).
 *
 * Evidence lives in evidence.json until the referrer log and Search Console job write it to a
 * database; the shape is the page_index_state row the plan describes.
 */

export interface PageEvidence {
  first_inbound_link_at?: string | null
  visitors_28d?: number
}

export type IndexState = "indexed" | "noindex"

export const VISITORS_TO_ADMIT = 10

/** The 12 Standard pages for the Pulse table's metrics: linked from the product and launch post from day one. */
export const PULSE_STANDARD = [
  "sessions",
  "product-view-rate",
  "add-to-cart-rate",
  "checkout-start-rate",
  "checkout-conversion",
  "orders",
  "conversion-rate",
  "aov",
  "net-revenue",
  "new-customers",
  "repeat-order-share",
  "mer",
] as const

/** Hand-written exceptions, indexed from day one. */
export const ALWAYS_INDEXED = new Set<string>(["/", paths.fluke(), paths.standard(), paths.whyIndex(), paths.ghIndex(), paths.ledger()])

const evidence = evidenceFile as Record<string, PageEvidence>

export function evidenceFor(path: string): PageEvidence {
  return evidence[path] ?? {}
}

export function hasEvidence(e: PageEvidence) {
  return !!e.first_inbound_link_at || (e.visitors_28d ?? 0) >= VISITORS_TO_ADMIT
}

export type PageKind = "metric" | "why" | "week" | "repo" | "result" | "fixed"

export interface PageContext {
  kind: PageKind
  path: string
  /** For metric and why pages. */
  spec?: Pick<MetricSpec, "id" | "reviewed_by">
  /** For week and repo pages: whether the data shown is from closed weeks. */
  closed?: boolean
}

export function indexState(ctx: PageContext): IndexState {
  if (ctx.kind === "result") return "noindex"
  if (ctx.kind === "fixed") return ALWAYS_INDEXED.has(ctx.path) ? "indexed" : "noindex"
  const ready = ctx.kind === "metric" || ctx.kind === "why" ? !!ctx.spec && isReviewed(ctx.spec) : !!ctx.closed
  if (!ready) return "noindex"
  if (ctx.kind === "metric" && ctx.spec && (PULSE_STANDARD as readonly string[]).includes(ctx.spec.id)) return "indexed"
  return hasEvidence(evidenceFor(ctx.path)) ? "indexed" : "noindex"
}

/** Next.js metadata `robots` for a page. Links are always followed; only indexing is withheld. */
export function robotsMeta(ctx: PageContext) {
  const index = indexState(ctx) === "indexed"
  return { index, follow: true, googleBot: { index, follow: true } }
}

/** For file twins and non-HTML routes: the X-Robots-Tag header value. */
export function robotsHeader(ctx: PageContext) {
  return indexState(ctx) === "indexed" ? "index, follow" : "noindex, follow"
}
