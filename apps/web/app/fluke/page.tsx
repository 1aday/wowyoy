import type { Metadata } from "next"
import { flukeTest, type FlukeUnit } from "@workspace/metrics"
import { Prompt } from "@workspace/ui/brand/prompt"
import { SiteHeader } from "@/components/site-header"
import { readWorkspace } from "@/lib/session"
import { serialize } from "@/lib/fluke/share"
import { FlukeTest } from "./fluke-test"

type Search = Promise<{ m?: string; v?: string; u?: string }>

function fromSearch(s: Awaited<Search>) {
  const values = (s.v ?? "")
    .split(",")
    .map(Number)
    .filter((x) => Number.isFinite(x))
    .slice(0, 160)
  if (values.length < 2) return null
  const unit: FlukeUnit = s.u === "usd" ? "$" : s.u === "pct" ? "%" : ""
  return { name: (s.m ?? "Metric").slice(0, 60), values, unit }
}

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const shared = fromSearch(await searchParams)
  const res = shared ? flukeTest(shared.values) : null
  const title = shared && res ? `${shared.name}: ${res.verdict}` : "The Fluke Test"
  const description = "Paste a weekly number with its history. See if last week's move is real or noise, with the noise of both weeks counted."
  const p = new URLSearchParams()
  if (shared) {
    p.set("m", shared.name)
    p.set("v", shared.values.join(","))
    if (shared.unit) p.set("u", shared.unit === "$" ? "usd" : "pct")
  }
  const image = `/fluke/og${shared ? `?${p}` : ""}`
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  }
}

export default async function FlukePage({ searchParams }: { searchParams: Search }) {
  const shared = fromSearch(await searchParams)
  const ws = await readWorkspace()
  return (
    <>
      <SiteHeader current="fluke" connected={!!ws} />
      <main className="mx-auto max-w-6xl px-4 pt-12 pb-24 sm:px-8">
        <Prompt command="fluke_test" flags="--free" className="mb-4" />
        <h1 className="pixel-79 max-md:pixel-46">Is this a fluke?</h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
          Paste a weekly number with its history. wowyoy checks last week against how much your weeks normally move, and tells you
          whether to act on it.
        </p>
        <FlukeTest initial={shared ? { name: shared.name, text: serialize(shared.values, shared.unit) } : undefined} />
      </main>
    </>
  )
}
