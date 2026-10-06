// A call's transcript, one line per turn.
export function TranscriptView({ turns }: { turns: { speaker: string; text: string }[] }) {
  if (turns.length === 0) return <p className="mt-4 text-gray-500">No transcript.</p>;
  return (
    <ol className="space-y-1.5 text-sm" data-testid="transcript">
      {turns.map((turn, i) => (
        <li key={i} className={turn.speaker === "agent" ? "" : "text-blue-800"}>
          <strong>{turn.speaker === "agent" ? "Agent" : "Caller"}:</strong> {turn.text}
        </li>
      ))}
    </ol>
  );
}
