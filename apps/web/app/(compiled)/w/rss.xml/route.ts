import { archiveWeeks } from "@/lib/ledger/archive"
import { ledgerRss } from "@/lib/ledger/rss"
import { ledgerWeeks } from "@/lib/ledger/week"

export const revalidate = 3600

export async function GET() {
  const weeks = await ledgerWeeks(archiveWeeks())
  return new Response(ledgerRss(weeks), {
    headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
  })
}
