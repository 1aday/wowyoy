/** Every public URL the compiler emits, in one place. Paths only; `absolute()` adds the origin. */

export const SITE_URL = "https://wowyoy.com"

export const absolute = (path: string) => `${SITE_URL}${path}`

export type WhyDirection = "dropped" | "spiked"
export const whyDirections: readonly WhyDirection[] = ["dropped", "spiked"]

export const paths = {
  standard: () => "/m",
  metric: (id: string) => `/m/${id}`,
  metricFile: (id: string, ext: "md" | "json" | "yaml") => `/m/${id}.${ext}`,
  whyIndex: () => "/why",
  why: (id: string, dir: WhyDirection) => `/why/${id}-${dir}`,
  whyFile: (id: string, dir: WhyDirection) => `/why/${id}-${dir}.md`,
  fluke: () => "/fluke",
  ghIndex: () => "/gh",
  repo: (owner: string, repo: string) => `/gh/${owner}/${repo}`,
  badge: (owner: string, repo: string) => `/gh/${owner}/${repo}/badge.svg`,
  ledger: () => "/w",
  week: (id: string) => `/w/${id}`,
  weekFile: (id: string) => `/w/${id}.md`,
  mcp: () => "/mcp",
  llms: () => "/llms.txt",
  llmsFull: () => "/llms-full.txt",
} as const

/** Parse a Why slug ("checkout-conversion-dropped") into its metric id and direction. */
export function parseWhySlug(slug: string): { id: string; direction: WhyDirection } | null {
  const m = /^([a-z0-9-]+)-(dropped|spiked)$/.exec(slug)
  return m ? { id: m[1]!, direction: m[2] as WhyDirection } : null
}
