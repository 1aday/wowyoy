import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { mappingSchema, type Mapping } from "@workspace/sources"
import { z } from "zod"

/**
 * The connected workspace lives in one encrypted, httpOnly cookie: no database, and the
 * PostHog key never reaches the browser after it's typed. AES-256-GCM with WOWYOY_SECRET.
 */

export const COOKIE = "wy_ws"

const workspaceSchema = z.object({
  v: z.literal(1),
  host: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  timezone: z.string(),
  apiKey: z.string(),
  mapping: mappingSchema,
  mappedBy: z.enum(["claude", "rules"]),
  connectedAt: z.string(),
})
export type Workspace = z.infer<typeof workspaceSchema>

export class SecretMissingError extends Error {
  constructor() {
    super("This deployment has no WOWYOY_SECRET, so it can't store a connection. Set it in the environment and redeploy.")
  }
}

function key() {
  const secret = process.env.WOWYOY_SECRET ?? (process.env.NODE_ENV === "production" ? undefined : "wowyoy-dev-only-secret")
  if (!secret) throw new SecretMissingError()
  return createHash("sha256").update(secret).digest()
}

export function canStoreConnections() {
  try {
    key()
    return true
  } catch {
    return false
  }
}

export function seal(ws: Workspace) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(ws), "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")
}

export function unseal(token: string): Workspace | null {
  try {
    const raw = Buffer.from(token, "base64url")
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
    const parsed = workspaceSchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function readWorkspace() {
  const token = (await cookies()).get(COOKIE)?.value
  return token ? unseal(token) : null
}

/** Only in a Server Function or Route Handler. */
export async function writeWorkspace(ws: Workspace) {
  // Cookies cap at 4KB: keep each reason short, it's only shown on the mapping screen.
  const slim: Mapping = JSON.parse(
    JSON.stringify(ws.mapping, (k, v) => (k === "reason" && typeof v === "string" && v.length > 140 ? `${v.slice(0, 139)}…` : v)),
  )
  ;(await cookies()).set(COOKIE, seal({ ...ws, mapping: slim }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.WOWYOY_INSECURE_COOKIES !== "1",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
}

export async function clearWorkspace() {
  ;(await cookies()).delete(COOKIE)
}

/** Self-hosters on a private network, and the e2e mock, can allow http and private hosts. */
export const allowPrivateHosts = process.env.WOWYOY_ALLOW_PRIVATE_HOSTS === "1"
