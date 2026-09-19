import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Desktop packaging (desktop/scripts/prepare-renderer.mjs) builds into a
  // SEPARATE dist dir so a production build never clobbers the live dev
  // server's `.next` cache.
  ...(process.env.OTAMA_PACK_BUILD ? { distDir: ".next-pack" } : {}),
  // Ship every Prisma query engine (incl. the Windows dll used by the
  // Electron build) inside the standalone renderer bundle.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/.prisma/client/**"],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
