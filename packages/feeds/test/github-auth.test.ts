import { generateKeyPairSync, createVerify } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import { appJwt, authFromEnv, authorizer, clearTokenCache, normalizePem } from "../src/github"

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString()

afterEach(() => clearTokenCache())

describe("GitHub App auth", () => {
  it("signs an RS256 JWT GitHub accepts the shape of", () => {
    const now = Date.parse("2026-10-21T12:00:00Z")
    const jwt = appJwt("123456", pem, now)
    const [h, p, s] = jwt.split(".")
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" })
    const payload = JSON.parse(Buffer.from(p!, "base64url").toString())
    expect(payload).toEqual({ iss: "123456", iat: now / 1000 - 60, exp: now / 1000 + 540 })
    const v = createVerify("RSA-SHA256")
    v.update(`${h}.${p}`)
    expect(v.verify(publicKey, Buffer.from(s!, "base64url"))).toBe(true)
  })

  it("reads env keys with flattened newlines or base64", () => {
    expect(normalizePem(pem.replace(/\n/g, "\\n"))).toBe(pem.trim())
    expect(normalizePem(Buffer.from(pem).toString("base64"))).toBe(pem.trim())
  })

  it("prefers the App, then a token, then anonymous", () => {
    expect(authFromEnv({ GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, GITHUB_APP_INSTALLATION_ID: "2", GITHUB_TOKEN: "t" }).kind).toBe("app")
    expect(authFromEnv({ GITHUB_APP_ID: "1", GITHUB_TOKEN: "t" })).toEqual({ kind: "token", token: "t" })
    expect(authFromEnv({}).kind).toBe("none")
  })

  it("mints an installation token once and reuses it until five minutes before expiry", async () => {
    let t = Date.parse("2026-10-21T12:00:00Z")
    const minted: string[] = []
    const fetch = (async (url: string, init: RequestInit) => {
      minted.push(url)
      expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer ey/)
      return new Response(JSON.stringify({ token: `ghs_${minted.length}`, expires_at: new Date(t + 3600e3).toISOString() }), { status: 201 })
    }) as typeof globalThis.fetch
    const a = authorizer({ kind: "app", appId: "1", privateKey: pem, installationId: "42" }, { fetch, now: () => t })
    const [x, y] = await Promise.all([a.authorization(), a.authorization()])
    expect(x).toBe("Bearer ghs_1")
    expect(y).toBe("Bearer ghs_1")
    t += 50 * 60e3
    expect(await a.authorization()).toBe("Bearer ghs_1")
    t += 6 * 60e3
    expect(await a.authorization()).toBe("Bearer ghs_2")
    expect(minted).toEqual(["https://api.github.com/app/installations/42/access_tokens", "https://api.github.com/app/installations/42/access_tokens"])
  })

  it("reads anonymously when minting fails", async () => {
    const fetch = (async () => new Response("{}", { status: 401 })) as unknown as typeof globalThis.fetch
    const a = authorizer({ kind: "app", appId: "1", privateKey: pem, installationId: "7" }, { fetch })
    const errors = console.error
    console.error = () => {}
    expect(await a.authorization()).toBeNull()
    console.error = errors
  })
})
