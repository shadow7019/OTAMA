import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // webtorrent must stay an external Node module (native bindings + dynamic
  // requires). Its transitive WebRTC backend (@thaunknown/simple-peer →
  // node-datachannel) loads a .node binary via a relative require that breaks
  // when bundled into a chunk, so the whole chain stays external too.
  serverExternalPackages: ["webtorrent", "@thaunknown/simple-peer", "node-datachannel"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
