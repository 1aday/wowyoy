import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Prompt } from "@workspace/ui/brand/prompt"
import { Page } from "@/components/standard/page-section"

export default function MetricNotFound() {
  return (
    <Page>
      <section className="py-20 sm:py-28">
        <Prompt command="define" flags="--metric ?" className="mb-6" />
        <h1 className="pixel-46 text-balance max-sm:pixel-33">
          No metric by that name.
          <span className="cursor-block" aria-hidden />
        </h1>
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
          It may not be written yet, or not reviewed. Every published metric, and every name it goes by, is in the Standard&apos;s index.
        </p>
        <Link href="/m" className="mt-8 inline-flex items-center gap-1.5 text-[15px] font-medium underline-offset-4 hover:underline">
          Find it in the Standard <ArrowRight className="size-4" strokeWidth={1.5} />
        </Link>
      </section>
    </Page>
  )
}
