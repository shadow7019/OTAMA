import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // webtorrent must stay an external Node module (native bindings + dynamic requires)
  serverExternalPackages: ["webtorrent"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
