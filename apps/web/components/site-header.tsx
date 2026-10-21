import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Logo } from "@workspace/ui/brand/logo"
import { cn } from "@workspace/ui/lib/utils"
import { ThemeToggle } from "./theme-toggle"

const links = [
  { href: "/m", label: "Metrics", key: "standard", hide: "" },
  { href: "/fluke", label: "Fluke Test", key: "fluke", hide: "" },
  { href: "/gh", label: "Repo Pulse", key: "gh", hide: "max-md:hidden" },
  { href: "/w", label: "Ledger", key: "ledger", hide: "max-md:hidden" },
  { href: "/demo", label: "Sample workspace", key: "demo", hide: "max-lg:hidden" },
] as const

/** The public header: logo, the public surfaces, and the one thing to do. */
export function SiteHeader({ current, connected }: { current?: (typeof links)[number]["key"] | "connect"; connected?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-8">
        <Link href="/" aria-label="wowyoy home" className="shrink-0">
          <Logo className="text-[18px]" />
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-[13.5px]">
          {links.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              aria-current={current === l.key ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground transition-colors duration-[80ms] hover:text-foreground",
                current === l.key && "text-foreground",
                l.hide,
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild size="lg" className="px-3">
            <Link href={connected ? "/app" : "/connect"}>{connected ? "Open workspace" : "Connect PostHog"}</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
