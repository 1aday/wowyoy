import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { robotsMeta } from "@workspace/compiler"
import { Prompt } from "@workspace/ui/brand/prompt"
import { SiteHeader } from "@/components/site-header"
import { readWorkspace } from "@/lib/session"
import { formatTwoWeekValue, parseTwoWeekPath, plain, runTwoWeek, type TwoWeekReport } from "@/lib/fluke/two-week"
import { FlukeTest } from "../fluke-test"

/**
 * A shared two-number result: /fluke/rate/800/4.1/3.6, /fluke/count/1184/1402, /fluke/amount/13000/412000/447000.
 * The live form, pre-filled. Never indexed; the canonical is /fluke.
 */

type Props = { params: Promise<{ slug: string[] }>; searchParams: Promise<{ cv?: string | string[] }> }

async function read({ params, searchParams }: Props): Promise<TwoWeekReport | null> {
  const [{ slug }, q] = await Promise.all([params, searchParams])
  const values = parseTwoWeekPath(slug, typeof q.cv === "string" ? q.cv : null)
  const r = values ? runTwoWeek(values) : null
  return r && !("error" in r) ? r : null
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const r = await read(props)
  if (!r) return {}
  const { kind, before, after } = r.values
  const title = `${r.headline.replace(/\.$/, "")}: ${formatTwoWeekValue(kind, before)} → ${formatTwoWeekValue(kind, after)}`
  const description = r.explain.map(plain).join(" ")
  const [, , ...nums] = r.path.split("?")[0]!.split("/")
  const image = `/fluke/og?${new URLSearchParams({ t: nums.join("/"), ...(r.values.cv ? { cv: String(r.values.cv) } : {}) })}`
  return {
    title,
    description,
    robots: robotsMeta({ kind: "result", path: r.path }),
    alternates: { canonical: "/fluke" },
    openGraph: { title, description, url: r.path, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  }
}

export default async function FlukeResultPage(props: Props) {
  const r = await read(props)
  if (!r) notFound()
  const ws = await readWorkspace()
  return (
    <>
      <SiteHeader current="fluke" connected={!!ws} />
      <main className="mx-auto max-w-6xl px-4 pt-12 pb-24 sm:px-8">
        <Prompt command="fluke_test" flags="--two-weeks --shared" className="mb-4" />
        <h1 className="pixel-79 max-md:pixel-46">Is this a fluke?</h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
          A shared result. Change any number to test your own, or switch to History and paste the weeks before it for the full test.
        </p>
        <FlukeTest initialTwoWeek={r.values} />
      </main>
    </>
  )
}
