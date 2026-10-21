import { allSpecs, dialects, specYaml, type MetricSpec } from "@workspace/metrics"
import { describe, expect, it } from "vitest"
import {
  STANDARD_NAME,
  definedTermJsonLd,
  fixedSitemapUrls,
  hasWhy,
  jsonLdScript,
  llmsFullTxt,
  llmsTxt,
  metricJson,
  metricMarkdown,
  metricSitemapUrls,
  personJsonLd,
  queryJsonLd,
  site,
  sitemapIndexXml,
  urlsetXml,
  whyMarkdown,
  whyPages,
  whySitemapUrls,
  whyTitle,
} from "../src"

const specs = allSpecs()
const ctx = { published: specs }
const byId = (id: string) => specs.find((s) => s.id === id)!
const reviewed = (s: MetricSpec): MetricSpec => ({ ...s, reviewed_by: "Test Reviewer", reviewed_at: "2026-10-01" })

/** Every Markdown link target, so none can be relative. */
const links = (md: string) => [...md.replace(/```[\s\S]*?```/g, "").matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]!)

describe("Markdown twin", () => {
  for (const spec of specs) {
    it(spec.id, () => {
      const md = metricMarkdown(spec, ctx)
      expect(md.startsWith(`# ${spec.name}\n\n> ${spec.definition.one_line}\n`)).toBe(true)
      expect(md.trimEnd().endsWith(`Source: https://wowyoy.com/m/${spec.id} · MIT`)).toBe(true)
      for (const h of ["## Why it matters", "## Definition", "## Events", "## Weekly query", "## Noise band", "## Pitfalls", "## Files"])
        expect(md).toContain(h)
      for (const d of ["HogQL", "Postgres", "BigQuery", "Snowflake"]) expect(md).toContain(`### ${d}\n`)
      expect(md.match(/```sql\n/g)?.length).toBe(4)
      for (const p of spec.prose.pitfalls) expect(md).toContain(`- ${p}`)
      for (const e of spec.events) expect(md).toContain(`### \`${e.name}\``)
      for (const l of links(md)) expect(l).toMatch(/^https:\/\//)
      if (spec.noise.type === "process") expect(md).toContain("has no sampling floor")
      else expect(md).toContain("| Weekly volume | Still noise |")
      if (hasWhy(spec)) expect(md).toContain(`(https://wowyoy.com/why/${spec.id}-dropped)`)
      expect(md).toContain(spec.reviewed_by ? "Reviewed by" : "Draft, not yet reviewed.")
    })
  }

  it("links related metrics only when they are published", () => {
    const spec = byId("net-revenue")
    const alone = metricMarkdown(spec, { published: [spec] })
    expect(alone).not.toContain("## Related")
    expect(alone).not.toContain("https://wowyoy.com/m/orders")
    expect(metricMarkdown(spec, ctx)).toContain("[Orders](https://wowyoy.com/m/orders)")
  })

  it("is identical every time it is compiled", () => {
    for (const s of specs.slice(0, 10)) expect(metricMarkdown(s, ctx)).toBe(metricMarkdown(s, ctx))
  })
})

describe("JSON twin", () => {
  for (const spec of specs) {
    it(spec.id, () => {
      const j = metricJson(spec, ctx)
      expect(Object.keys(j)).toEqual(["format", "format_version", "url", "status", "spec", "compiled", "source", "license"])
      expect(j.format).toBe("wowyoy.metric")
      expect(j.url).toBe(`https://wowyoy.com/m/${spec.id}`)
      expect(Object.keys(j.spec).slice(0, 3)).toEqual(["id", "name", "aliases"])
      expect(Object.keys(j.compiled.queries)).toEqual([...dialects])
      for (const d of dialects) expect((j.compiled.queries as Record<string, { sql: string }>)[d]!.sql).toBeTruthy()
      if (spec.noise.type === "process") expect(j.compiled.noise_band).toBeNull()
      else expect(j.compiled.noise_band).toHaveLength(4)
      expect(j.compiled.why.length).toBe(hasWhy(spec) ? 2 : 0)
      expect(JSON.stringify(j)).toBe(JSON.stringify(metricJson(spec, ctx)))
    })
  }

  it("serves the YAML spec verbatim", () => {
    for (const s of specs) expect(specYaml(s.id)).toContain(`id: ${s.id}`)
  })
})

describe("Why twin", () => {
  const pages = whyPages(specs)
  it("exists for every spec with enough drivers, both directions", () => {
    expect(pages.length).toBe(specs.filter(hasWhy).length * 2)
  })
  for (const w of pages) {
    it(w.slug, () => {
      const md = whyMarkdown(w.spec, w.direction, ctx)
      expect(md.startsWith(`# ${whyTitle(w.spec, w.direction)}`)).toBe(true)
      const order = ["## 1. Chance", "## 2. The world", "## 3. Your business"].map((h) => md.indexOf(h))
      expect(order.every((i) => i > 0)).toBe(true)
      expect([...order].sort((a, b) => a - b)).toEqual(order)
      expect(md.trimEnd().endsWith(`Source: https://wowyoy.com/why/${w.slug} · MIT`)).toBe(true)
      for (const l of links(md)) expect(l).toMatch(/^https:\/\//)
      expect(md.match(/^### \d+\. /gm)?.length).toBe(w.spec.drivers.length)
    })
  }

  it("reads naturally", () => {
    expect(whyTitle(byId("checkout-conversion"), "dropped")).toBe("Why did checkout conversion drop?")
    expect(whyTitle({ name: "MRR" }, "spiked")).toBe("Why did MRR spike?")
  })
})

describe("llms.txt", () => {
  it("follows llmstxt.org: H1, blockquote, then sections of links", () => {
    const txt = llmsTxt(specs)
    const lines = txt.split("\n")
    expect(lines[0]).toBe("# wowyoy")
    expect(lines[2]!.startsWith("> ")).toBe(true)
    expect(txt).toContain("## The Standard: Store conversion")
    for (const s of specs) expect(txt).toContain(`(https://wowyoy.com/m/${s.id}.md): `)
    expect(txt).toContain("(https://wowyoy.com/mcp)")
    expect(txt).toContain("(https://wowyoy.com/api/fluke)")
    expect(txt).toContain("(https://wowyoy.com/w)")
    expect(txt).toContain("## Optional")
    expect(txt.match(/^# /gm)).toHaveLength(1)
  })

  it("says plainly when nothing is published", () => {
    const txt = llmsTxt([])
    expect(txt).toContain("no metrics are published yet")
    expect(txt).not.toContain("## Optional")
    expect(llmsFullTxt([])).toContain("no metrics are published yet")
  })

  it("llms-full.txt holds every published page in full", () => {
    const full = llmsFullTxt(specs)
    for (const s of specs) expect(full).toContain(`Source: https://wowyoy.com/m/${s.id} · MIT`)
    expect(full.split("\n\n---\n\n").length).toBeGreaterThanOrEqual(specs.length + 1)
  })
})

describe("structured data", () => {
  const spec = byId("checkout-conversion")
  it("defines each metric in the Standard's DefinedTermSet", () => {
    const t = definedTermJsonLd(spec)
    expect(t["@type"]).toBe("DefinedTerm")
    expect(t.termCode).toBe("checkout-conversion")
    expect((t.inDefinedTermSet as Record<string, unknown>).name).toBe(STANDARD_NAME)
    expect(t.alternateName).toEqual(spec.aliases)
  })

  it("describes each query as SoftwareSourceCode", () => {
    for (const d of dialects) {
      const q = queryJsonLd(spec, d)!
      expect(q["@type"]).toBe("SoftwareSourceCode")
      expect(q.text).toContain("AS value")
      expect(q.license).toBe("https://opensource.org/licenses/MIT")
    }
  })

  it("has no Person until a byline is configured", () => {
    expect(site.byline).toBeNull()
    expect(personJsonLd()).toBeNull()
    expect(personJsonLd({ name: "Ada Analyst", url: "https://example.com" })).toEqual({
      "@context": "https://schema.org",
      "@type": "Person",
      name: "Ada Analyst",
      url: "https://example.com",
    })
  })

  it("can't close its script tag", () => {
    expect(jsonLdScript({ name: "</script><script>alert(1)</script>" })).not.toContain("<")
  })
})

describe("sitemaps", () => {
  it("lists only indexed pages: drafts never, reviewed Pulse metrics from day one", () => {
    const drafts = specs.map((s) => ({ ...s, reviewed_by: null }))
    expect(metricSitemapUrls(drafts)).toEqual([])
    expect(whySitemapUrls(drafts)).toEqual([])
    const ok = [reviewed(byId("checkout-conversion")), reviewed(byId("mrr"))]
    // checkout-conversion is a Pulse metric; mrr needs an inbound link first.
    expect(metricSitemapUrls(ok)).toEqual(["https://wowyoy.com/m/checkout-conversion"])
  })

  it("always lists the fixed pages", () => {
    expect(fixedSitemapUrls()).toEqual(["/", "/fluke", "/gh", "/m", "/w", "/why"].map((p) => `https://wowyoy.com${p}`))
  })

  it("writes valid sitemap XML", () => {
    const idx = sitemapIndexXml(new Date("2026-10-19T06:00:00Z"))
    expect(idx).toContain("<loc>https://wowyoy.com/sitemap/metrics.xml</loc>")
    expect(idx).toContain("<lastmod>2026-10-19T06:00:00.000Z</lastmod>")
    expect(idx.match(/<sitemap>/g)).toHaveLength(5)
    expect(urlsetXml([{ url: "https://wowyoy.com/a?b=1&c=2" }])).toContain("<loc>https://wowyoy.com/a?b=1&amp;c=2</loc>")
    expect(urlsetXml([])).toContain("<urlset")
  })
})
