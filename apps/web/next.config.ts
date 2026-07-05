import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "sw.js",
  reloadOnOnline: true,
});

const nextConfig: NextConfig = {
  transpilePackages: ["@carelog/db", "@carelog/queue", "@carelog/storage"],
  turbopack: {
    root: "../..",
  },
};

export default withSerwist(nextConfig);
