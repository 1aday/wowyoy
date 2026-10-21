import { absolute, paths, robotsHeader } from "@workspace/compiler"
import { parseWeekId } from "@workspace/metrics"
import { weekState } from "@/lib/ledger/archive"
import { weekMarkdown } from "@/lib/ledger/markdown"
import { ledgerWeek, repoRows } from "@/lib/ledger/week"

/** /w/<week>.md (rewritten here): the week page as Markdown, for agents and copy-paste. */
export const revalidate = 86400

export function generateStaticParams() {
  return []
}

export async function GET(_req: Request, { params }: { params: Promise<{ week: string }> }) {
  const week = parseWeekId((await params).week)
  if (!week || weekState(week) !== "closed") return new Response("Not a closed week in the Monday Ledger.\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } })
  const [ledger, repos] = await Promise.all([ledgerWeek(week), repoRows(week)])
  return new Response(weekMarkdown(ledger, repos), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      link: `<${absolute(paths.week(week.id))}>; rel="canonical"`,
      "x-robots-tag": robotsHeader({ kind: "week", path: paths.weekFile(week.id), closed: true }),
    },
  })
}
