// @ts-check
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/next-env.d.ts",
    "packages/db/src/generated/**",
    ".ddev/**",
  ]),

  // TypeScript rules for every workspace.
  ...tseslint.configs.recommended,
  {
    rules: {
      // Prefix a parameter with _ to mark it as intentionally unused (e.g. in mocks).
      // ignoreRestSiblings allows `const { id, ...rest } = obj` to drop fields.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },

  // Next.js + React rules, only for the web app.
  {
    files: ["apps/web/**"],
    extends: [nextVitals],
    settings: { next: { rootDir: "apps/web/" } },
  },

  // Must stay last: turns off rules that would fight with Prettier.
  prettier,
]);
