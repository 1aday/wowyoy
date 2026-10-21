import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/metrics", "@workspace/sources"],
}

export default nextConfig
