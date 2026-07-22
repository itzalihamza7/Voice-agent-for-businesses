import { configDefaults, defineConfig } from "vitest/config";

// One test run for the whole monorepo. Tests live next to the code as *.test.ts.
// Tests that need PostgreSQL are named *.db.test.ts and run separately (vitest.db.config.ts).
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/*.db.test.ts"],
    environment: "node",
  },
});
