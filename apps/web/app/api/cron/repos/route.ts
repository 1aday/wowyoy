import { revalidatePath, revalidateTag } from "next/cache"
import { paths } from "@workspace/compiler"
import { repoTags } from "@workspace/feeds"
import { WATCHED } from "@/lib/gh/seed"

/**
 * Refresh Repo Pulse: every watched repo's page and badge, and the /gh index. Runs daily at 06:30 UTC,
 * so on Monday it lands right after the weekly close and a closed week is judged on complete data.
 * Pages regenerate on their next visit, not all at once.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 })
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 })

  // On the run after the weekly close, drop the cached GitHub reads too: one from before midnight misses the end of the week.
  const now = new Date()
  const monday = now.getUTCDay() === 1 && now.getUTCHours() === 6
  for (const full of WATCHED) {
    const [owner = "", repo = ""] = full.split("/")
    if (monday) revalidateTag(repoTags(owner, repo)[1]!, { expire: 0 })
    revalidatePath(paths.repo(owner, repo))
    revalidatePath(paths.badge(owner, repo))
  }
  revalidatePath(paths.ghIndex())
  revalidatePath("/gh/moves.json")
  return Response.json({ revalidated: WATCHED.length, readsDropped: monday })
}
