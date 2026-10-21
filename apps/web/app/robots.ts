import type { MetadataRoute } from "next"
import { absolute } from "@workspace/compiler"

/** Crawl everything; indexing is decided per page by X-Robots-Tag and robots meta, never here. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: absolute("/sitemap.xml"),
  }
}
