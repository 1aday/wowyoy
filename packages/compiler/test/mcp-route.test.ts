import { describe, expect, it } from "vitest"
import { DELETE, GET, OPTIONS, POST } from "../../../apps/web/app/mcp/route"
import { LEGACY_VERSIONS, MODERN_VERSIONS } from "../src/mcp-http"

/** Drives the real /mcp route handler, the way an MCP client over Streamable HTTP would. */

const URL_ = "https://wowyoy.com/mcp"
const ACCEPT = "application/json, text/event-stream"

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request(URL_, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: ACCEPT, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  )
}

const rpc = (id: number | string, method: string, params?: Record<string, unknown>) => ({
  jsonrpc: "2.0",
  id,
  method,
  ...(params ? { params } : {}),
})

describe("legacy clients: initialize, initialized, tools/list, tools/call", () => {
  it("runs the whole lifecycle", async () => {
    const init = await post(
      rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } })
    )
    expect(init.status).toBe(200)
    expect(init.headers.get("content-type")).toContain("application/json")
    expect(init.headers.get("mcp-session-id")).toBeNull()
    const ib = await init.json()
    expect(ib.result.protocolVersion).toBe("2025-06-18")
    expect(ib.result.capabilities.tools).toEqual({ listChanged: false })
    expect(ib.result.serverInfo.name).toBe("wowyoy")
    expect(ib.result.instructions).toContain("define")

    const h = { "MCP-Protocol-Version": ib.result.protocolVersion }
    const note = await post({ jsonrpc: "2.0", method: "notifications/initialized" }, h)
    expect(note.status).toBe(202)
    expect(await note.text()).toBe("")

    const list = await (await post(rpc(2, "tools/list"), h)).json()
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(["define", "query", "fluke"])

    const res = await post(rpc(3, "tools/call", { name: "define", arguments: { metric: "Checkout completion rate" } }), h)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(3)
    expect(body.result.isError).toBe(false)
    expect(body.result.structuredContent.id).toBe("checkout-conversion")
    expect(body.result.content[0].text).toContain("Source: https://wowyoy.com/m/checkout-conversion")

    const q = await (
      await post(rpc(4, "tools/call", { name: "query", arguments: { metric: "net-revenue", dialect: "snowflake" } }), h)
    ).json()
    expect(q.result.structuredContent.sql).toContain("TRY_TO_DOUBLE")

    const ping = await (await post(rpc("p", "ping"), h)).json()
    expect(ping).toEqual({ jsonrpc: "2.0", id: "p", result: {} })
  })

  it("negotiates down to the newest version it speaks", async () => {
    const r = await (await post(rpc(1, "initialize", { protocolVersion: "2099-01-01", capabilities: {} }))).json()
    expect(r.result.protocolVersion).toBe(LEGACY_VERSIONS[0])
  })

  it("answers unknown methods and tools with JSON-RPC errors", async () => {
    expect((await (await post(rpc(1, "resources/list"))).json()).error.code).toBe(-32601)
    expect((await (await post(rpc(2, "tools/call", { name: "nope" }))).json()).error.code).toBe(-32602)
  })

  it("rejects an unknown protocol version header", async () => {
    const r = await post(rpc(1, "tools/list"), { "MCP-Protocol-Version": "1999-01-01" })
    expect(r.status).toBe(400)
    expect((await r.json()).error.data.supported).toContain("2025-11-25")
  })
})

describe("modern clients (2026-07-28): per-request metadata, no handshake", () => {
  const v = MODERN_VERSIONS[0]
  const meta = { "io.modelcontextprotocol/protocolVersion": v, "io.modelcontextprotocol/clientCapabilities": {} }
  const headers = (method: string, name?: string) => ({
    "MCP-Protocol-Version": v,
    "Mcp-Method": method,
    ...(name ? { "Mcp-Name": name } : {}),
  })

  it("discovers, lists and calls", async () => {
    const d = await (await post(rpc(1, "server/discover", { _meta: meta }), headers("server/discover"))).json()
    expect(d.result.resultType).toBe("complete")
    expect(d.result.supportedVersions).toContain(v)
    expect(d.result.capabilities.tools).toBeTruthy()

    const l = await (await post(rpc(2, "tools/list", { _meta: meta }), headers("tools/list"))).json()
    expect(l.result.resultType).toBe("complete")
    expect(l.result.tools).toHaveLength(3)
    expect(l.result.cacheScope).toBe("public")

    const c = await (
      await post(
        rpc(3, "tools/call", { name: "fluke", arguments: { kind: "rate", before: 4.1, after: 3.6, volume: 800 }, _meta: meta }),
        headers("tools/call", "fluke")
      )
    ).json()
    expect(c.result.resultType).toBe("complete")
    expect(c.result.structuredContent.fluke_url).toBe("https://wowyoy.com/fluke/rate/800/4.1/3.6")
    expect(c.result._meta["io.modelcontextprotocol/serverInfo"].name).toBe("wowyoy")
  })

  it("accepts a Base64 Mcp-Name", async () => {
    const r = await post(
      rpc(1, "tools/call", { name: "define", arguments: { metric: "mrr" }, _meta: meta }),
      headers("tools/call", `=?base64?${btoa("define")}?=`)
    )
    expect(r.status).toBe(200)
  })

  it("rejects headers that don't match the body", async () => {
    const cases: [Record<string, string>, Record<string, unknown>, number, number][] = [
      [headers("tools/list"), { _meta: meta }, 400, -32020],
      [{ "MCP-Protocol-Version": v }, { _meta: meta }, 400, -32020],
      [headers("tools/call", "query"), { name: "define", arguments: {}, _meta: meta }, 400, -32020],
      [headers("tools/call"), { name: "define", arguments: {}, _meta: meta }, 400, -32020],
      [
        { ...headers("tools/call", "define"), "MCP-Protocol-Version": "2025-06-18" },
        { name: "define", arguments: {}, _meta: meta },
        400,
        -32020,
      ],
    ]
    for (const [h, params, status, code] of cases) {
      const r = await post(rpc(9, "tools/call", params), h)
      expect(r.status).toBe(status)
      expect((await r.json()).error.code).toBe(code)
    }
  })

  it("names its versions when asked for one it doesn't speak", async () => {
    const m = { ...meta, "io.modelcontextprotocol/protocolVersion": "2030-01-01" }
    const r = await post(rpc(1, "tools/list", { _meta: m }), { ...headers("tools/list"), "MCP-Protocol-Version": "2030-01-01" })
    expect(r.status).toBe(400)
    const b = await r.json()
    expect(b.error.code).toBe(-32022)
    expect(b.error.data).toEqual({ supported: [...MODERN_VERSIONS, ...LEGACY_VERSIONS], requested: "2030-01-01" })
  })

  it("requires the per-request metadata", async () => {
    const noCaps = await post(rpc(1, "tools/list", { _meta: { "io.modelcontextprotocol/protocolVersion": v } }), headers("tools/list"))
    expect(noCaps.status).toBe(400)
    expect((await noCaps.json()).error.code).toBe(-32602)
    const noMeta = await post(rpc(2, "tools/list"), headers("tools/list"))
    expect(noMeta.status).toBe(400)
  })

  it("404s an unknown method", async () => {
    const r = await post(rpc(1, "prompts/list", { _meta: meta }), headers("prompts/list"))
    expect(r.status).toBe(404)
    expect((await r.json()).error.code).toBe(-32601)
  })
})

describe("transport", () => {
  it("refuses GET and DELETE with 405 and an Allow header", async () => {
    for (const r of [GET(), DELETE()]) {
      expect(r.status).toBe(405)
      expect(r.headers.get("allow")).toBe("POST, OPTIONS")
    }
  })

  it("answers CORS preflight for browser clients", () => {
    const r = OPTIONS()
    expect(r.status).toBe(204)
    expect(r.headers.get("access-control-allow-origin")).toBe("*")
    expect(r.headers.get("access-control-allow-headers")).toContain("MCP-Protocol-Version")
    expect(r.headers.get("access-control-allow-methods")).toContain("POST")
  })

  it("rejects batches, bad JSON, wrong content types and bad origins", async () => {
    const batch = await post([rpc(1, "ping"), rpc(2, "ping")])
    expect(batch.status).toBe(400)
    expect((await batch.json()).error.code).toBe(-32600)
    const bad = await post("{not json")
    expect(bad.status).toBe(400)
    expect((await bad.json()).error.code).toBe(-32700)
    expect((await post(rpc(1, "ping"), { "Content-Type": "text/plain" })).status).toBe(415)
    expect((await post(rpc(1, "ping"), { Accept: "text/html" })).status).toBe(406)
    expect((await post(rpc(1, "ping"), { Origin: "javascript:alert(1)" })).status).toBe(403)
    expect((await post(rpc(1, "ping"), { Origin: "https://claude.ai" })).status).toBe(200)
    expect((await post({ jsonrpc: "2.0", id: null, method: "ping" })).status).toBe(400)
    expect((await post({ jsonrpc: "2.0", id: 1, result: {} })).status).toBe(202)
    expect((await post("x".repeat(70_000))).status).toBe(413)
  })

  it("ignores a session id: every request stands alone", async () => {
    const r = await post(rpc(1, "tools/list"), { "Mcp-Session-Id": "abc" })
    expect(r.status).toBe(200)
    expect(r.headers.get("mcp-session-id")).toBeNull()
  })
})
