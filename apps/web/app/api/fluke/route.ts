import { handleGet, handleOptions, handlePost } from "@/lib/fluke/api"

/** The Fluke Test as JSON. Open to any origin; rate-limited per IP, per server instance. */

export function GET(req: Request) {
  return handleGet(req)
}

export function POST(req: Request) {
  return handlePost(req)
}

export function OPTIONS() {
  return handleOptions()
}
