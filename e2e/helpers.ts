import type { Page } from "@playwright/test";

export const DEMO = {
  email: process.env.E2E_EMAIL ?? "demo@example.com",
  password: process.env.E2E_PASSWORD ?? "demo-password",
};

/** Where global-setup.ts saves the signed-in session. */
export const STORAGE_STATE = "e2e/.auth/demo.json";

/** Opens the home page as the signed-in demo owner. */
export async function openHome(page: Page) {
  await page.goto("/");
  await page.getByRole("heading", { name: "Your agents" }).waitFor();
}
