import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// reloadOnOnline is deliberately off: reconnecting mid-entry would reload the
// page out from under a half-written note. The outbox drain and delta pull on
// `online` already bring the page back up to date without losing form state.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "sw.js",
});

const nextConfig: NextConfig = {
  transpilePackages: ["@carelog/db", "@carelog/queue", "@carelog/storage"],
  turbopack: {
    root: "../..",
  },
};

export default withSerwist(nextConfig);
