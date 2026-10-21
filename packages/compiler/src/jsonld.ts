import { dialectNames, type Dialect, type MetricSpec } from "@workspace/metrics"
import { emitQuery } from "./query"
import { absolute, paths, site, type Byline } from "./site"

/** schema.org structured data for the Standard's pages. Render with `jsonLdScript`. */

type JsonLd = Record<string, unknown>

export const STANDARD_NAME = "The wowyoy Standard"

/** The DefinedTermSet every metric belongs to. */
export function definedTermSetJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": `${absolute(paths.standard())}#standard`,
    name: STANDARD_NAME,
    url: absolute(paths.standard()),
    description: "Executable definitions of the weekly metrics a founder reads: one formula, four queries and a noise band each.",
  }
}

/** A metric as a schema.org DefinedTerm in the Standard. */
export function definedTermJsonLd(spec: MetricSpec): JsonLd {
  const url = absolute(paths.metric(spec.id))
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    "@id": `${url}#term`,
    name: spec.name,
    ...(spec.aliases.length ? { alternateName: spec.aliases } : {}),
    description: spec.definition.one_line,
    termCode: spec.id,
    url,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      "@id": `${absolute(paths.standard())}#standard`,
      name: STANDARD_NAME,
      url: absolute(paths.standard()),
    },
  }
}

const languages: Record<Dialect, string> = { hogql: "HogQL", postgres: "PostgreSQL", bigquery: "GoogleSQL", snowflake: "Snowflake SQL" }

/** A metric's weekly query in one dialect as SoftwareSourceCode, or null when it has none. */
export function queryJsonLd(spec: MetricSpec, dialect: Dialect): JsonLd | null {
  const text = emitQuery(spec, dialect)
  if (!text) return null
  const url = absolute(paths.metric(spec.id))
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    "@id": `${url}#query-${dialect}`,
    name: `${spec.name}: weekly query in ${dialectNames[dialect]}`,
    description: `${spec.definition.formula}. One row per complete week, Monday 00:00 UTC.`,
    programmingLanguage: { "@type": "ComputerLanguage", name: languages[dialect] },
    codeSampleType: "full solution",
    text,
    url,
    license: site.license.url,
    about: { "@id": `${url}#term` },
    ...(site.byline ? { author: personJsonLd(site.byline) } : {}),
  }
}

/** The Standard's author, or null while no byline is configured. */
export function personJsonLd(byline: Byline | null = site.byline): JsonLd | null {
  if (!byline) return null
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: byline.name,
    ...(byline.url ? { url: byline.url } : {}),
    ...(byline.image ? { image: byline.image } : {}),
    ...(byline.jobTitle ? { jobTitle: byline.jobTitle } : {}),
    ...(byline.sameAs?.length ? { sameAs: byline.sameAs } : {}),
  }
}

/** JSON for a <script type="application/ld+json">, with "<" escaped so no string can close the tag. */
export function jsonLdScript(data: JsonLd | JsonLd[]) {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
