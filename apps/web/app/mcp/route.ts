import { handleMcpPost, mcpMethodNotAllowed, mcpOptions } from "@workspace/compiler/mcp-http"
import { publishedSpecs } from "@workspace/metrics"

/** The MCP server: Streamable HTTP, stateless, read-only, JSON replies. The protocol lives in the compiler. */

export const dynamic = "force-dynamic"

export function POST(req: Request) {
  return handleMcpPost(req, { specs: () => publishedSpecs() })
}

export function GET() {
  return mcpMethodNotAllowed()
}

export function DELETE() {
  return mcpMethodNotAllowed()
}

export function OPTIONS() {
  return mcpOptions()
}
