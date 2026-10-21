import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/metrics", "@workspace/sources", "@workspace/compiler", "@workspace/feeds"],
  async rewrites() {
    return {
      // File twins of compiled pages share the page's URL with an extension: /m/aov.md, /w/2026-w43.md.
      beforeFiles: [
        { source: "/m/:id([a-z0-9-]+).:ext(md|json|yaml)", destination: "/api/twin/m/:id/:ext" },
        { source: "/why/:slug([a-z0-9-]+).md", destination: "/api/twin/why/:slug" },
        { source: "/w/:week(\\d{4}-w\\d{2}).md", destination: "/api/twin/w/:week" },
      ],
      afterFiles: [],
      fallback: [],
    }
  },
}

export default nextConfig
