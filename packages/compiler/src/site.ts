/** Every public URL the compiler emits, in one place. Paths only; `absolute()` adds the origin. */

export const SITE_URL = "https://wowyoy.com"

export const absolute = (path: string) => `${SITE_URL}${path}`

/** The person who signs the Standard, shown as its author. Null until it's decided; nothing renders a byline then. */
export interface Byline {
  name: string
  /** A page about the person, absolute. */
  url?: string
  /** A square photo, absolute. */
  image?: string
  jobTitle?: string
  /** Profiles elsewhere, absolute. */
  sameAs?: string[]
}

export const site: {
  name: string
  url: string
  summary: string
  license: { name: string; url: string }
  byline: Byline | null
} = {
  name: "wowyoy",
  url: SITE_URL,
  summary: "wowyoy reads a founder's analytics every Monday and says what moved and whether it is real.",
  license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
  byline: null,
}

export type WhyDirection = "dropped" | "spiked"
export const whyDirections: readonly WhyDirection[] = ["dropped", "spiked"]

export interface FlukeTwoInput {
  kind: "rate" | "count" | "amount" | "average"
  /** Rates in percent (4.1 = 4.1%). */
  before: number
  after: number
  volume?: number
  cv?: number
}

const pathNumber = (n: number) => String(Number(n.toFixed(6)))

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
  /** The two-number Fluke Test, pre-filled: /fluke/rate/800/4.1/3.6 (rates in percent), /fluke/count/1184/1402. */
  flukeTwo: (v: FlukeTwoInput) => {
    const nums = v.kind === "count" ? [v.before, v.after] : [v.volume ?? 0, v.before, v.after]
    const cv = (v.kind === "amount" || v.kind === "average") && v.cv != null && v.cv !== 1 ? `?cv=${pathNumber(v.cv)}` : ""
    return `/fluke/${v.kind}/${nums.map(pathNumber).join("/")}${cv}`
  },
  flukeApi: () => "/api/fluke",
  mcp: () => "/mcp",
  llms: () => "/llms.txt",
  llmsFull: () => "/llms-full.txt",
} as const

/** Parse a Why slug ("checkout-conversion-dropped") into its metric id and direction. */
export function parseWhySlug(slug: string): { id: string; direction: WhyDirection } | null {
  const m = /^([a-z0-9-]+)-(dropped|spiked)$/.exec(slug)
  return m ? { id: m[1]!, direction: m[2] as WhyDirection } : null
}
