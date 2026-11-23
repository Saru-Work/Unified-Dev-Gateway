import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server in .next/standalone, for the production image.
  output: "standalone",
  // Trace from this folder, not the repo root (which has its own lockfile),
  // so server.js sits at the top of .next/standalone as the Dockerfile expects.
  outputFileTracingRoot: path.join(__dirname),
  // The default (bottom-left) covers the sidebar's theme switch in dev.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
