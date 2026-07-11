import { defineConfig } from "vitest/config";

// One test run for the whole monorepo. Tests live next to the code as *.test.ts.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    environment: "node",
  },
});
