import { CallTable } from "@/features/dashboard/CallTable";

// Monitoring dashboard: list of calls. /dashboard/calls
export default function CallsPage() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Calls</h1>
      <CallTable calls={[]} />
    </main>
  );
}
