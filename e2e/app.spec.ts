import { expect, test } from "@playwright/test";
import { openHome } from "./helpers";

test("visitors must sign in", async ({ browser }) => {
  const page = await browser.newPage({ storageState: { cookies: [], origins: [] } });
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  const api = await page.request.get("/api/agents");
  expect(api.status()).toBe(401);
});

test("create an agent and save a version in the builder", async ({ page }) => {
  await openHome(page);
  const name = `E2E agent ${Date.now()}`;
  await page.getByLabel("New agent name").fill(name);
  await page.getByRole("button", { name: /create/i }).click();
  await page.locator(".react-flow__node").first().waitFor();
  await expect(page.getByLabel("Agent name")).toHaveValue(name);
  await page.getByLabel("Agent name").fill(`${name} (renamed)`);
  await page.getByRole("button", { name: "Save version" }).click();
  await expect(page.getByText("Saved as v2")).toBeVisible();
  // Clean up through the database-free route: agents can't be deleted yet, so keep the name
  // recognisable ("E2E ...") for manual cleanup.
});

test("the knowledge base lists documents and previews chunks", async ({ page }) => {
  await openHome(page);
  await page.getByRole("link", { name: "Knowledge base" }).click();
  await expect(page.getByRole("heading", { name: "Knowledge base" })).toBeVisible();
  const add = page.getByTestId("add-document");
  await add
    .getByLabel("Document text")
    .fill("# Prices\nA haircut is £30.\n\n# Hours\nOpen 9 to 5.");
  await add.getByRole("button", { name: "Preview chunks" }).click();
  await expect(add.getByTestId("preview-count")).toContainText("2 chunks");
});
