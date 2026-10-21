import Link from "next/link"
import { Logo } from "@workspace/ui/brand/logo"

const columns = [
  {
    title: "Free",
    links: [
      { href: "/m", label: "The Standard" },
      { href: "/why", label: "Why it moved" },
      { href: "/fluke", label: "Fluke Test" },
      { href: "/gh", label: "Repo Pulse" },
      { href: "/w", label: "Monday Ledger" },
    ],
  },
  {
    title: "Product",
    links: [
      { href: "/demo", label: "Sample workspace" },
      { href: "/connect", label: "Connect PostHog" },
    ],
  },
  {
    title: "Machines",
    links: [
      { href: "/llms.txt", label: "llms.txt" },
      { href: "/mcp", label: "MCP server" },
      { href: "/w/rss.xml", label: "RSS" },
      { href: "https://github.com/1aday/wowyoy", label: "GitHub" },
    ],
  },
] as const

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-8 md:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,10rem))]">
        <div>
          <Logo className="text-[16px]" cursor={false} />
          <p className="mt-3 max-w-xs text-[13.5px] leading-relaxed text-muted-foreground">
            Every page here is compiled from open metric specs. Free and open source, MIT.
          </p>
        </div>
        {columns.map((c) => (
          <div key={c.title}>
            <div className="label-mono">{c.title}</div>
            <ul className="mt-3 space-y-2 text-[13.5px]">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-muted-foreground transition-colors duration-[80ms] hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  )
}
