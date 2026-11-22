import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The default (bottom-left) covers the sidebar's theme switch in dev.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
