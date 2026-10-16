import Link from "next/link"
import { generateStore, verdict } from "@workspace/metrics"
import { Logo } from "@workspace/ui/brand/logo"
import { Prompt } from "@workspace/ui/brand/prompt"
import { Verdict } from "@workspace/ui/brand/verdict"

export default function Home() {
  const rows = generateStore()
  const v = verdict(rows, rows.length - 1)
  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col px-4 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/kit" className="font-mono text-xs text-muted-foreground hover:text-foreground">
          /kit
        </Link>
      </header>
      <section className="my-auto py-24">
        <Prompt command="weekly_read" flags="--sample store --compare wow,yoy" className="mb-6" />
        <Verdict verdict={v} size={79} className="max-md:pixel-46" />
        <p className="mt-8 max-w-xl text-lg text-muted-foreground">
          Connect PostHog and get one table and one sentence every Monday: what moved your business, and whether
          it&apos;s real or a fluke.
        </p>
      </section>
    </main>
  )
}
