import type { CallLog } from "@voice-agent/shared";

// Placeholder for the call log table (date, agent, version, duration, sentiment).
// Data will come from /api/calls. Filters and sentiment charts will live next to this file.
export function CallTable({ calls }: { calls: CallLog[] }) {
  if (calls.length === 0) {
    return <p className="mt-4 text-gray-500">No calls yet.</p>;
  }
  return (
    <ul className="mt-4">
      {calls.map((call) => (
        <li key={call.callId}>{call.callId}</li>
      ))}
    </ul>
  );
}
