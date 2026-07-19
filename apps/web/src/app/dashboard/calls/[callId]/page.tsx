import { TranscriptView } from "@/features/dashboard/TranscriptView";

// One call: transcript and sentiment. /dashboard/calls/:callId
export default async function CallDetailPage({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Call {callId}</h1>
      <TranscriptView turns={[]} />
    </main>
  );
}
