import { BuilderCanvas } from "@/features/builder/BuilderCanvas";

// Agent builder page: /agents/:agentId/builder
export default async function BuilderPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Agent builder: {agentId}</h1>
      <BuilderCanvas />
    </main>
  );
}
