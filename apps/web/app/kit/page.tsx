import type { Metadata } from "next"
import { Suspense } from "react"
import { Kit } from "./kit"

export const metadata: Metadata = {
  title: "Design kit",
  robots: { index: false },
}

export default function KitPage() {
  return (
    <Suspense>
      <Kit />
    </Suspense>
  )
}
