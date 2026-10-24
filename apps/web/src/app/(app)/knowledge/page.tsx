import type { Metadata } from "next";
import { connection } from "next/server";
import { KnowledgeBase } from "@/features/knowledge/KnowledgeBase";
import { getKnowledgeStore } from "@/server/knowledge";

export const metadata: Metadata = { title: "Knowledge base" };

// The business's knowledge base: documents agents can search in Knowledge lookup steps.
export default async function KnowledgePage() {
  await connection();
  const documents = await (await getKnowledgeStore()).listDocuments();
  return (
    // Full height inside the app shell: cancel the page padding.
    <div className="-mx-8 -my-8 flex h-screen flex-col bg-white">
      <header className="flex items-baseline gap-4 border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">Knowledge base</h1>
        <p className="text-sm text-slate-500">
          Documents your agents can answer from (shared by all agents of the business).
        </p>
      </header>
      <KnowledgeBase initialDocuments={documents} />
    </div>
  );
}
