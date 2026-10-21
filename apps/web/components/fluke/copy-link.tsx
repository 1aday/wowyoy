"use client"

import { Link2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"

/** Copies the page's current URL, which always reproduces the result on screen. */
export function CopyLink({ label = "Copy result link", className }: { label?: string; className?: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast("Link copied")
    } catch {
      toast(window.location.href)
    }
  }
  return (
    <Button variant="outline" onClick={copy} className={className}>
      <Link2 className="size-4" strokeWidth={1.5} /> {label}
    </Button>
  )
}
