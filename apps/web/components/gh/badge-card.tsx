"use client"

import * as React from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Prompt } from "@workspace/ui/brand/prompt"
import { cn } from "@workspace/ui/lib/utils"
import { Segmented } from "@/components/segmented"

type Size = "sm" | "md" | "lg"
type Theme = "light" | "dark" | "auto"

const sizeOptions: { value: Size; label: string }[] = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
]
const themeOptions: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "auto", label: "Both" },
]

/** The README badge: a preview, three sizes, light, dark or both, and the snippet to paste. */
export function BadgeCard({ fullName, path, origin, className }: { fullName: string; path: string; origin: string; className?: string }) {
  const [size, setSize] = React.useState<Size>("sm")
  const [theme, setTheme] = React.useState<Theme>("auto")
  const [copied, setCopied] = React.useState(false)
  const src = (t: "light" | "dark", abs = true) => {
    const q = new URLSearchParams()
    if (size !== "sm") q.set("size", size)
    if (t === "dark") q.set("theme", "dark")
    const s = q.toString()
    return `${abs ? origin : ""}${path}/badge.svg${s ? `?${s}` : ""}`
  }
  const alt = `Repo Pulse for ${fullName}`
  const snippet =
    theme === "auto"
      ? `<a href="${origin}${path}"><picture><source media="(prefers-color-scheme: dark)" srcset="${src("dark")}"><img alt="${alt}" src="${src("light")}"></picture></a>`
      : `[![${alt}](${src(theme)})](${origin}${path})`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      toast("Snippet copied")
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast("Select the snippet and copy it")
    }
  }

  return (
    <section className={cn("min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6", className)} aria-labelledby="badge-title">
      <Prompt command="badge" flags={`--repo ${fullName.toLowerCase()}`} className="mb-3 truncate" />
      <h2 id="badge-title" className="text-[17px] font-medium">
        Put this week&apos;s call in your README
      </h2>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
        It updates every hour and links back here. A filled pill means a real move; plain text means noise.
      </p>

      <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
        {(theme === "auto" ? (["light", "dark"] as const) : [theme]).map((t) => (
          <div
            key={t}
            className={cn("flex min-h-[88px] items-center justify-center p-5", theme !== "auto" && "sm:col-span-2", t === "dark" ? "bg-[#0d1117]" : "bg-white")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(t, false)} alt={alt} data-testid={`badge-preview-${t}`} />
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Segmented label="Badge size" value={size} options={sizeOptions} onChange={setSize} />
        <Segmented label="Badge theme" value={theme} options={themeOptions} onChange={setTheme} />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-background p-3">
        <code className="min-w-0 flex-1 font-mono text-[12px] leading-relaxed break-all text-muted-foreground" data-testid="badge-snippet">
          {snippet}
        </code>
        <Button variant="outline" size="icon-sm" onClick={copy} aria-label="Copy snippet" title="Copy snippet">
          {copied ? <Check strokeWidth={1.5} /> : <Copy strokeWidth={1.5} />}
        </Button>
      </div>
      <p className="mt-2 font-mono text-[11.5px] text-muted-foreground">
        {theme === "auto" ? "HTML: GitHub picks the version that matches the reader's theme." : "Markdown."} Add ?measure=forks for another measure.
      </p>
    </section>
  )
}
