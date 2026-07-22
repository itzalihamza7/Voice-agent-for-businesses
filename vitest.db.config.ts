import { defineConfig } from "vitest/config";

// Integration tests that need the PostgreSQL database (files named *.db.test.ts).
// Run inside DDEV: `ddev npm run test:db`. The normal `npm test` skips them.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.db.test.ts", "apps/*/src/**/*.db.test.ts"],
    environment: "node",
  },
});
