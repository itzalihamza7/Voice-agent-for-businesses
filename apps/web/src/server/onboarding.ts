import { websiteAgentDraft } from "@voice-agent/orchestrator";
import { chunkText, embedChunks, extractFromUrl, sitemapPages } from "@voice-agent/rag";
import { changesData } from "@voice-agent/shared";
import { detectConnection, type DetectedConnection } from "@voice-agent/tools";
import { listConnections, networkOptions, saveConnection } from "./connections";
import { embeddingModels, getKnowledgeStore } from "./knowledge";
import { getAgentConfigStore } from "./store";

// Connecting a business by its website address, with no change to the website:
//   1. scan: which pages the sitemap lists and which API the site's app offers (GET only);
//   2. set up: import the pages into the knowledge base, save the connection, create the agent.

export interface WebsiteScan {
  origin: string;
  pages: string[];
  detected: DetectedConnection | null;
}

export async function scanWebsite(url: string): Promise<WebsiteScan> {
  const options = networkOptions();
  const [pages, detected] = await Promise.all([
    sitemapPages(url, { ...options, limit: 25 }).catch(() => []),
    detectConnection(url, options),
  ]);
  return { origin: new URL(url).origin, pages: pages.length ? pages : [url], detected };
}

export interface SetupResult {
  agentId: string;
  imported: number;
  failed: string[];
  tools: string[];
  /** True if some of the app's actions change data and stay off until the domain is verified. */
  writesLocked: boolean;
}

export async function setUpFromWebsite(
  businessId: string,
  input: { url: string; businessName: string; transferNumber: string | null; pages: string[] },
): Promise<SetupResult> {
  const options = networkOptions();
  const scan = await detectConnection(input.url, options);

  // 1. Knowledge: one document per page, split at headings, embedded with every model.
  const store = await getKnowledgeStore(businessId);
  const existing = new Set((await store.listDocuments()).map((d) => d.sourceUrl));
  const models = embeddingModels();
  let imported = 0;
  const failed: string[] = [];
  for (const page of input.pages.slice(0, 25)) {
    if (existing.has(page)) continue;
    try {
      const { title, text } = await extractFromUrl(page, options);
      if (text.trim().length < 80) continue;
      const chunks = await chunkText(text, "headings", models[0] ?? null);
      const { embeddings } = await embedChunks(chunks, models);
      await store.addDocument({
        title: title || page,
        sourceType: "url",
        sourceUrl: page,
        chunking: "headings",
        content: text,
        chunks,
        embeddings,
      });
      imported++;
    } catch {
      failed.push(page);
    }
  }

  // 2. The app's API, if one was found: its actions become the agent's tools.
  let tools: string[] = [];
  let writesLocked = false;
  if (scan) {
    // Setting up again reuses the connection made the first time (slugs are unique).
    const saved =
      (await listConnections(businessId)).find((c) => c.slug === scan.connection.slug) ??
      (await saveConnection(businessId, {
        ...scan.connection,
        name: scan.how === "template" ? `${input.businessName} bookings` : scan.connection.name,
        secret: null,
      }));
    if (saved) {
      tools = saved.actions.map((a) => `${saved.slug}_${a.name}`);
      writesLocked = !saved.writesAllowed && saved.actions.some(changesData);
    }
  }

  // 3. A ready agent that uses both.
  const draft = websiteAgentDraft({
    businessName: input.businessName,
    kind: scan?.how === "template" && scan.connection.slug === "rides" ? "chauffeur" : "general",
    tools,
    transferNumber: input.transferNumber,
  });
  const agent = await (
    await getAgentConfigStore(businessId)
  ).saveNewVersion({
    ...draft,
    agentId: crypto.randomUUID(),
  });
  return { agentId: agent.agentId, imported, failed, tools, writesLocked };
}
