import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Logo } from "@workspace/ui/brand/logo"
import { SiteMenu, SiteNav, type SiteSection } from "./site-nav"
import { ThemeToggle } from "./theme-toggle"

/**
 * The public header: logo, the public sections, and the one thing to do.
 * Compiled pages are static, so they never pass `connected` (it would need the session cookie).
 */
export function SiteHeader({ current, connected }: { current?: SiteSection | "connect"; connected?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-8">
        <Link href="/" aria-label="wowyoy home" className="shrink-0">
          <Logo className="text-[18px]" />
        </Link>
        <SiteNav current={current} />
        <div className="flex items-center gap-1 max-sm:ml-auto">
          <ThemeToggle />
          <Button asChild size="lg" className="px-3">
            <Link href={connected ? "/app" : "/connect"}>{connected ? "Open workspace" : "Connect PostHog"}</Link>
          </Button>
          <SiteMenu current={current} />
        </div>
      </div>
    </header>
  )
}
