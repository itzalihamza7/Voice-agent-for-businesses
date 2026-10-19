import { request, type FullConfig } from "@playwright/test";
import { DEMO, STORAGE_STATE } from "./helpers";

// Signs in once and saves the session for every test (sign-in attempts are rate limited).
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]!.use.baseURL!;
  const api = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
  const response = await api.post("/api/auth/login", { data: DEMO });
  if (!response.ok()) throw new Error(`Sign-in failed: HTTP ${response.status()}`);
  await api.storageState({ path: STORAGE_STATE });
  await api.dispose();
}
