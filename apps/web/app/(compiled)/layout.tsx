import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"

/** Every compiled surface: static where it can be, so the header never reads the session cookie. */
export default function CompiledLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  )
}
