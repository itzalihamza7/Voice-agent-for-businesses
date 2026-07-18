import Link from "next/link";

// Home page. Later: list of the business's agents.
export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Voice Agent Platform</h1>
      <p className="mt-2 text-gray-600">Boilerplate only. Nothing works yet.</p>
      <ul className="mt-6 list-disc space-y-1 pl-5">
        <li>
          <Link className="text-blue-600 underline" href="/agents/demo/builder">
            Agent builder (demo agent)
          </Link>
        </li>
        <li>
          <Link className="text-blue-600 underline" href="/dashboard/calls">
            Call dashboard
          </Link>
        </li>
      </ul>
    </main>
  );
}
