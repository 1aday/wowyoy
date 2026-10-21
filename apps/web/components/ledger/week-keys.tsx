"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** `[` and `]` step to the previous and next week, as everywhere else in wowyoy. */
export function WeekKeys({ prev, next }: { prev: string | null; next: string | null }) {
  const router = useRouter()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return
      if (e.key === "[" && prev) router.push(prev)
      if (e.key === "]" && next) router.push(next)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [prev, next, router])
  return null
}
