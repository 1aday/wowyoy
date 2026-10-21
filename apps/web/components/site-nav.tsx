"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@workspace/ui/lib/utils"

export const siteLinks = [
  { href: "/m", label: "Metrics", key: "standard", match: ["/m", "/why"], hide: "" },
  { href: "/fluke", label: "Fluke Test", key: "fluke", match: ["/fluke"], hide: "" },
  { href: "/gh", label: "Repo Pulse", key: "gh", match: ["/gh"], hide: "max-md:hidden" },
  { href: "/w", label: "Ledger", key: "ledger", match: ["/w"], hide: "max-md:hidden" },
  { href: "/demo", label: "Sample workspace", key: "demo", match: ["/demo"], hide: "max-lg:hidden" },
] as const

export type SiteSection = (typeof siteLinks)[number]["key"]

const inSection = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`)

/** The public sections. The current one is read from the URL, so static pages need no prop. */
export function SiteNav({ current }: { current?: SiteSection | "connect" }) {
  const path = usePathname() ?? ""
  const active = current ?? siteLinks.find((l) => l.match.some((m) => inSection(path, m)))?.key
  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1 text-[13.5px]">
      {siteLinks.map((l) => (
        <Link
          key={l.key}
          href={l.href}
          aria-current={active === l.key ? "page" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground transition-colors duration-[80ms] hover:text-foreground",
            active === l.key && "text-foreground",
            l.hide,
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  )
}
