import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Prompt } from "@workspace/ui/brand/prompt"
import { Page } from "@/components/standard/page-section"

export default function WhyNotFound() {
  return (
    <Page>
      <section className="py-20 sm:py-28">
        <Prompt command="why" flags="--metric ?" className="mb-6" />
        <h1 className="pixel-46 text-balance max-sm:pixel-33">
          No Why page here yet.
          <span className="cursor-block" aria-hidden />
        </h1>
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
          A metric gets its two Why pages once its spec is reviewed and lists at least three drivers. The ones that exist are in the index.
        </p>
        <Link href="/why" className="mt-8 inline-flex items-center gap-1.5 text-[15px] font-medium underline-offset-4 hover:underline">
          See every Why page <ArrowRight className="size-4" strokeWidth={1.5} />
        </Link>
      </section>
    </Page>
  )
}
