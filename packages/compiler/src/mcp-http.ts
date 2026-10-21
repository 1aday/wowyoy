import type { MetricSpec } from "@workspace/metrics"
import { SERVER_INSTRUCTIONS, callTool, hasTool, tools } from "./mcp"

/**
 * MCP over Streamable HTTP, stateless and read-only, using only web-standard Request/Response.
 *
 * Dual-era, as the 2026-07-28 revision allows:
 * - Modern requests carry `_meta["io.modelcontextprotocol/protocolVersion"]` and the mirrored
 *   MCP-Protocol-Version, Mcp-Method and Mcp-Name headers; each is served on its own.
 * - Legacy clients (2025-03-26 to 2025-11-25) open with `initialize`; the server negotiates a
 *   version and then answers tools/list and tools/call without keeping a session.
 * Replies are always one JSON object (never SSE). No batches: no supported revision allows them.
 */

export const MODERN_VERSIONS = ["2026-07-28"] as const
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const
const SUPPORTED: readonly string[] = [...MODERN_VERSIONS, ...LEGACY_VERSIONS]

export const SERVER_INFO = { name: "wowyoy", title: "wowyoy Standard", version: "1.0.0", websiteUrl: "https://wowyoy.com" }

const MAX_BODY = 64 * 1024

const ERR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  headerMismatch: -32020,
  unsupportedVersion: -32022,
} as const

/** Browsers may call from any page: the server is public, read-only and takes no credentials. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID, *",
  "Access-Control-Max-Age": "86400",
}

type Id = string | number
type Json = Record<string, unknown>

function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS_HEADERS, ...extra },
  })
}

const errorBody = (id: Id | null, code: number, message: string, data?: unknown) => ({
  jsonrpc: "2.0",
  ...(id == null ? {} : { id }),
  error: { code, message, ...(data === undefined ? {} : { data }) },
})

const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v)

/** Mcp-Name values may be Base64 in the =?base64?…?= sentinel form. */
function decodeHeader(v: string) {
  const m = /^=\?base64\?([A-Za-z0-9+/=]*)\?=$/.exec(v)
  if (!m) return v
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
}

/** A well-formed web origin, or "null" from sandboxed frames and file pages. */
function validOrigin(origin: string) {
  if (origin === "null") return true
  try {
    const u = new URL(origin)
    return (u.protocol === "https:" || u.protocol === "http:") && u.origin === origin
  } catch {
    return false
  }
}

const accepts = (accept: string | null) => !accept || /(^|,)\s*(application\/json|application\/\*|\*\/\*)\s*(;|,|$)/i.test(accept)

export interface McpOptions {
  /** The specs this deployment publishes, read per request. */
  specs: () => readonly MetricSpec[]
}

/** GET (the old standalone SSE stream) and DELETE (the old session end) are not offered. */
export function mcpMethodNotAllowed() {
  return json(405, errorBody(null, ERR.invalidRequest, "Method not allowed. POST JSON-RPC messages to this endpoint."), {
    Allow: "POST, OPTIONS",
  })
}

export function mcpOptions() {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS, Allow: "POST, OPTIONS" } })
}

export async function handleMcpPost(req: Request, opts: McpOptions): Promise<Response> {
  const origin = req.headers.get("origin")
  if (origin != null && !validOrigin(origin)) return json(403, errorBody(null, ERR.invalidRequest, "Forbidden origin."))
  const type = req.headers.get("content-type") ?? ""
  if (!/^application\/json\s*(;|$)/i.test(type))
    return json(415, errorBody(null, ERR.invalidRequest, "Content-Type must be application/json."))
  if (!accepts(req.headers.get("accept"))) return json(406, errorBody(null, ERR.invalidRequest, "Accept must include application/json."))

  const declared = Number(req.headers.get("content-length") ?? 0)
  if (declared > MAX_BODY) return json(413, errorBody(null, ERR.invalidRequest, "Body too large."))
  const text = await req.text()
  if (text.length > MAX_BODY) return json(413, errorBody(null, ERR.invalidRequest, "Body too large."))

  let msg: unknown
  try {
    msg = JSON.parse(text)
  } catch {
    return json(400, errorBody(null, ERR.parse, "Parse error: the body is not JSON."))
  }
  if (Array.isArray(msg))
    return json(400, errorBody(null, ERR.invalidRequest, "Batches are not supported: send one JSON-RPC message per request."))
  if (!isObj(msg) || msg.jsonrpc !== "2.0")
    return json(400, errorBody(null, ERR.invalidRequest, "Invalid request: expected a JSON-RPC 2.0 object."))

  // A response or a notification needs no reply.
  if (!("method" in msg) && ("result" in msg || "error" in msg)) return new Response(null, { status: 202, headers: CORS_HEADERS })
  if (typeof msg.method !== "string") return json(400, errorBody(null, ERR.invalidRequest, "Invalid request: method must be a string."))
  if (!("id" in msg)) return new Response(null, { status: 202, headers: CORS_HEADERS })

  const id = msg.id
  if (typeof id !== "string" && (typeof id !== "number" || !Number.isFinite(id))) {
    return json(400, errorBody(null, ERR.invalidRequest, "Invalid request: id must be a string or a number."))
  }
  if (msg.params !== undefined && !isObj(msg.params)) return json(400, errorBody(id, ERR.invalidParams, "params must be an object."))
  const params: Json = (msg.params as Json | undefined) ?? {}
  const meta = isObj(params._meta) ? params._meta : {}
  const headerVersion = req.headers.get("mcp-protocol-version")
  const bodyVersion = meta["io.modelcontextprotocol/protocolVersion"]

  if (bodyVersion !== undefined || (headerVersion != null && (MODERN_VERSIONS as readonly string[]).includes(headerVersion))) {
    return modern(req, id, msg.method, params, meta, opts)
  }
  if (headerVersion != null && !SUPPORTED.includes(headerVersion)) {
    return json(
      400,
      errorBody(id, ERR.unsupportedVersion, "Unsupported protocol version", { supported: SUPPORTED, requested: headerVersion })
    )
  }
  return legacy(id, msg.method, params, opts)
}

const result = (id: Id, r: Json, status = 200) => json(status, { jsonrpc: "2.0", id, result: r })

function toolsCall(params: Json, specs: readonly MetricSpec[]): { error: [number, string] } | { result: Json } {
  if (typeof params.name !== "string") return { error: [ERR.invalidParams, "tools/call needs params.name."] }
  if (!hasTool(params.name)) return { error: [ERR.invalidParams, `Unknown tool: ${params.name}`] }
  const r = callTool(params.name, params.arguments, specs)
  return { result: { ...r } }
}

/** Initialization-era clients: initialize, then plain requests. No session is minted or required. */
function legacy(id: Id, method: string, params: Json, opts: McpOptions): Response {
  switch (method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : null
      const protocolVersion = requested && (LEGACY_VERSIONS as readonly string[]).includes(requested) ? requested : LEGACY_VERSIONS[0]
      return result(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      })
    }
    case "ping":
      return result(id, {})
    case "tools/list":
      return result(id, { tools })
    case "tools/call": {
      const r = toolsCall(params, opts.specs())
      return "error" in r ? json(200, errorBody(id, ...r.error)) : result(id, r.result)
    }
    case "server/discover":
      return result(id, discover())
    default:
      return json(200, errorBody(id, ERR.methodNotFound, `Method not found: ${method}`))
  }
}

function discover(): Json {
  return {
    supportedVersions: SUPPORTED,
    capabilities: { tools: { listChanged: false } },
    instructions: SERVER_INSTRUCTIONS,
    _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
  }
}

const cached = { ttlMs: 3_600_000, cacheScope: "public" } as const

/** Per-request metadata clients (2026-07-28): validate the mirrored headers, then answer statelessly. */
function modern(req: Request, id: Id, method: string, params: Json, meta: Json, opts: McpOptions): Response {
  const version = meta["io.modelcontextprotocol/protocolVersion"]
  if (typeof version !== "string") {
    return json(400, errorBody(id, ERR.invalidParams, 'Missing params._meta["io.modelcontextprotocol/protocolVersion"].'))
  }
  const headerVersion = req.headers.get("mcp-protocol-version")
  if (headerVersion == null)
    return json(400, errorBody(id, ERR.headerMismatch, "Header mismatch: MCP-Protocol-Version header is required."))
  if (headerVersion !== version) {
    return json(
      400,
      errorBody(
        id,
        ERR.headerMismatch,
        `Header mismatch: MCP-Protocol-Version header '${headerVersion}' does not match body value '${version}'.`
      )
    )
  }
  if (!(MODERN_VERSIONS as readonly string[]).includes(version)) {
    return json(400, errorBody(id, ERR.unsupportedVersion, "Unsupported protocol version", { supported: SUPPORTED, requested: version }))
  }
  if (!isObj(meta["io.modelcontextprotocol/clientCapabilities"])) {
    return json(400, errorBody(id, ERR.invalidParams, 'Missing params._meta["io.modelcontextprotocol/clientCapabilities"].'))
  }
  const methodHeader = req.headers.get("mcp-method")
  if (methodHeader !== method) {
    const why =
      methodHeader == null
        ? "Mcp-Method header is required"
        : `Mcp-Method header value '${methodHeader}' does not match body value '${method}'`
    return json(400, errorBody(id, ERR.headerMismatch, `Header mismatch: ${why}.`))
  }
  if (method === "tools/call") {
    const nameHeader = req.headers.get("mcp-name")
    const decoded = nameHeader == null ? null : decodeHeader(nameHeader)
    if (decoded !== params.name) {
      const why =
        nameHeader == null
          ? "Mcp-Name header is required"
          : `Mcp-Name header value '${nameHeader}' does not match body value '${String(params.name)}'`
      return json(400, errorBody(id, ERR.headerMismatch, `Header mismatch: ${why}.`))
    }
  }

  const done = (r: Json) => result(id, { resultType: "complete", ...r, _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO } })
  switch (method) {
    case "server/discover":
      return result(id, { resultType: "complete", ...discover(), ...cached })
    case "ping":
      return done({})
    case "tools/list":
      return done({ tools, ...cached })
    case "tools/call": {
      const r = toolsCall(params, opts.specs())
      return "error" in r ? json(200, errorBody(id, ...r.error)) : done(r.result)
    }
    default:
      return json(404, errorBody(id, ERR.methodNotFound, `Method not found: ${method}`))
  }
}
