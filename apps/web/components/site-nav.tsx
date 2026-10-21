"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@workspace/ui/components/sheet"
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
function useActive(current?: SiteSection | "connect") {
  const path = usePathname() ?? ""
  return current ?? siteLinks.find((l) => l.match.some((m) => inSection(path, m)))?.key
}

export function SiteNav({ current }: { current?: SiteSection | "connect" }) {
  const active = useActive(current)
  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1 text-[13.5px] max-sm:hidden">
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

/** Under 640px the sections move into a sheet behind one button. */
export function SiteMenu({ current }: { current?: SiteSection | "connect" }) {
  const active = useActive(current)
  const [open, setOpen] = React.useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu" className="sm:hidden">
          <Menu className="size-4" strokeWidth={1.5} />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 p-6">
        <SheetTitle className="label-mono">Sections</SheetTitle>
        <nav className="mt-4 flex flex-col">
          {siteLinks.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              onClick={() => setOpen(false)}
              aria-current={active === l.key ? "page" : undefined}
              className={cn(
                "border-b border-border py-3 text-[15px] text-muted-foreground transition-colors duration-[80ms] hover:text-foreground",
                active === l.key && "text-foreground",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
