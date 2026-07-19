import type { TranscriptTurn } from "@voice-agent/shared";

// Placeholder for a call transcript, one line per turn (caller / agent).
// Later: per-turn sentiment and audio playback.
export function TranscriptView({ turns }: { turns: TranscriptTurn[] }) {
  if (turns.length === 0) {
    return <p className="mt-4 text-gray-500">No transcript yet.</p>;
  }
  return (
    <ol className="mt-4 space-y-2">
      {turns.map((turn) => (
        <li key={turn.atMs}>
          <strong>{turn.speaker}:</strong> {turn.text}
        </li>
      ))}
    </ol>
  );
}
