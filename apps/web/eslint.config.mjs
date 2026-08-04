import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-next turns on only 6 of the jsx-a11y rules. Take the full
  // recommended set so accessibility regressions fail lint rather than review.
  // Only the rules are spread, not `plugins`: eslint-config-next already
  // registers the "jsx-a11y" namespace (same plugin version, different module
  // instance), and flat config rejects a second registration of the same key.
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    rules: jsxA11y.flatConfigs.recommended.rules,
  },
  {
    files: ["src/auth.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated service worker output (Serwist/webpack build artifact).
    "sw.js",
    "sw.js.map",
  ]),
]);

export default eslintConfig;
