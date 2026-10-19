import { defineConfig } from "@playwright/test";
import { STORAGE_STATE } from "./helpers";

// End-to-end tests against a running app (DDEV by default). They need no language models.
//   npm run test:e2e            (E2E_BASE_URL to test another deployment)
export default defineConfig({
  testDir: ".",
  globalSetup: "./global-setup.ts",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://voice-agent.ddev.site",
    ignoreHTTPSErrors: true,
    storageState: STORAGE_STATE,
    viewport: { width: 1440, height: 900 },
  },
  reporter: [["list"]],
});
