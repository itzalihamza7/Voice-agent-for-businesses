import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCost } from "@/features/builder/LlmMeta";
import { TraceView } from "@/features/dashboard/TraceView";
import { TranscriptView } from "@/features/dashboard/TranscriptView";
import { getCall } from "@/server/call-log";

export const metadata: Metadata = { title: "Call" };

// One call: analysis, transcript and the full trace. /dashboard/calls/:callId
export default async function CallDetailPage({ params }: { params: Promise<{ callId: string }> }) {
  const call = await getCall((await params).callId);
  if (!call) notFound();
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/dashboard/calls" className="text-sm text-brand-600 hover:underline">
        ← All calls
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">
        {call.agentName} v{call.agentVersion} · {new Date(call.startedAt).toLocaleString()}
      </h1>
      <p className="text-sm text-gray-600" data-testid="call-analysis">
        {call.summary ?? "Analysis pending…"}
        {call.intent && ` · intent: ${call.intent}`}
        {call.outcome && ` · outcome: ${call.outcome}`}
        {call.sentiment && ` · sentiment: ${call.sentiment}`}
        {call.costUsd !== null && ` · AI cost ${formatCost(call.costUsd)}`}
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-2 font-semibold">Transcript</h2>
          <TranscriptView turns={call.transcript} />
        </section>
        <section className="card p-5">
          <h2 className="mb-2 font-semibold">Trace</h2>
          <TraceView trace={call.trace} />
        </section>
      </div>
    </div>
  );
}
