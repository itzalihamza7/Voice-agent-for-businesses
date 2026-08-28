import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { KnowledgeBase } from "@/features/knowledge/KnowledgeBase";
import { getKnowledgeStore } from "@/server/knowledge";

export const metadata: Metadata = { title: "Knowledge base" };

// The business's knowledge base: documents agents can search in Knowledge lookup steps.
export default async function KnowledgePage() {
  await connection();
  const documents = await getKnowledgeStore().listDocuments();
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-gray-200 px-6 py-3">
        <Link href="/" className="text-sm text-blue-600 underline">
          ← Agents
        </Link>
        <h1 className="text-lg font-semibold">Knowledge base</h1>
        <p className="text-sm text-gray-500">
          Documents your agents can answer from (shared by all agents of the business).
        </p>
      </header>
      <KnowledgeBase initialDocuments={documents} />
    </div>
  );
}
