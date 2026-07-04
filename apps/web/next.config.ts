import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@carelog/db"],
  turbopack: {
    root: "../..",
  },
};

export default nextConfig;
