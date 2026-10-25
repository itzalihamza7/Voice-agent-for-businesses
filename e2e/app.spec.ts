import { expect, test } from "@playwright/test";
import { openHome } from "./helpers";

test("visitors see the landing page and must sign in", async ({ browser }) => {
  const page = await browser.newPage({ storageState: { cookies: [], origins: [] } });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Get started", exact: true })).toBeVisible();
  await page.goto("/agents");
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

test("the website widget is public but only shows on the business's sites", async ({
  page,
  browser,
}) => {
  // A fixture agent of its own, never a real one.
  const created = await page.request.post("/api/agents", {
    data: { name: `E2E widget ${Date.now()}` },
  });
  const { agent } = (await created.json()) as { agent: { agentId: string } };
  const saved = await page.request.put(`/api/agents/${agent.agentId}/widget`, {
    data: {
      enabled: true,
      allowedHosts: ["https://www.example.com/shop"],
      color: "#0f766e",
      title: "E2E shop",
      dailyCostCapUsd: 1,
    },
  });
  const { widget } = (await saved.json()) as {
    widget: { publicId: string; allowedHosts: string[] };
  };
  expect(widget.allowedHosts).toEqual(["example.com"]);

  // Visitors aren't signed in.
  const visitor = await browser.newPage({ storageState: { cookies: [], origins: [] } });
  const script = await visitor.request.get("/widget.js");
  expect(script.headers()["content-type"]).toContain("javascript");
  expect(
    (await visitor.request.get(`/api/widget/${widget.publicId}?host=shop.example.com`)).status(),
  ).toBe(200);
  expect(
    (await visitor.request.get(`/api/widget/${widget.publicId}?host=example.org`)).status(),
  ).toBe(404);
  const embed = await visitor.request.get(`/embed/${widget.publicId}`);
  expect(embed.headers()["content-security-policy"]).toBe(
    "frame-ancestors 'self' https://example.com https://*.example.com",
  );
  // A chat can't be continued without its token.
  const reply = await visitor.request.post(`/api/widget/${widget.publicId}/chats/not-a-chat`, {
    data: { token: "x".repeat(20), text: "hello" },
  });
  expect(reply.status()).toBe(403);
});
