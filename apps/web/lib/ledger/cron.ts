import { timingSafeEqual } from "node:crypto"

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without a configured secret nothing is authorized. */
export function cronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = Buffer.from(req.headers.get("authorization") ?? "")
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 })
