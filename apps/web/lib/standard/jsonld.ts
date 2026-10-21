import { absolute, emitQuery, paths, type WhyDirection } from "@workspace/compiler"
import type { MetricSpec } from "@workspace/metrics"
import { whyQuestion } from "./spec-view"

/** Structured data for compiled pages: a Standard page is a defined term plus the code that computes it. */

const REPO = "https://github.com/1aday/wowyoy"
const termSet = { "@type": "DefinedTermSet", "@id": absolute(`${paths.standard()}#set`), name: "The wowyoy Standard", url: absolute(paths.standard()) }

export function metricJsonLd(spec: MetricSpec) {
  const url = absolute(paths.metric(spec.id))
  const query = emitQuery(spec, "hogql")
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "DefinedTerm",
        "@id": `${url}#term`,
        name: spec.name,
        alternateName: spec.aliases.length ? spec.aliases : undefined,
        description: spec.definition.one_line,
        termCode: spec.id,
        url,
        inDefinedTermSet: termSet,
      },
      {
        "@type": "SoftwareSourceCode",
        "@id": `${url}#query`,
        name: `${spec.name}: weekly query`,
        description: `${spec.definition.formula}. One row per complete ISO week.`,
        programmingLanguage: "SQL",
        codeSampleType: "code snippet",
        text: query ?? undefined,
        license: "https://opensource.org/licenses/MIT",
        codeRepository: REPO,
        about: { "@id": `${url}#term` },
      },
    ],
  }
}

export function whyJsonLd(spec: MetricSpec, direction: WhyDirection, steps: { name: string; text: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: whyQuestion(spec, direction),
    url: absolute(paths.why(spec.id, direction)),
    about: { "@type": "DefinedTerm", name: spec.name, url: absolute(paths.metric(spec.id)), inDefinedTermSet: termSet },
    step: steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text })),
  }
}

/** Inline JSON-LD safely: `<` is escaped so the payload can never close the script tag. */
export const jsonLdHtml = (data: unknown) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") })
