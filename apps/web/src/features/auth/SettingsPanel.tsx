"use client";

import { useCallback, useEffect, useState } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export function SettingsPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [keySet, setKeySet] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "editor" });
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const fetchAll = useCallback(
    () =>
      Promise.all([
        fetch("/api/business/users").then((r) => r.json() as Promise<{ users: User[] }>),
        fetch("/api/business/secrets").then((r) => r.json() as Promise<{ set: string[] }>),
      ]),
    [],
  );
  const apply = useCallback(([u, s]: Awaited<ReturnType<typeof fetchAll>>) => {
    setUsers(u.users);
    setKeySet(s.set.includes("OPENAI_API_KEY"));
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((data) => !cancelled && apply(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fetchAll, apply]);

  async function send(url: string, method: string, body: unknown, done: string) {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = (await response.json()) as { error?: string; issues?: { message: string }[] };
    setMessage(
      response.ok
        ? { text: done }
        : { text: out.issues?.[0]?.message ?? out.error ?? "Didn't work.", error: true },
    );
    apply(await fetchAll());
    return response.ok;
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-semibold">People</h2>
        <ul className="text-sm" data-testid="users">
          {users.map((u) => (
            <li key={u.id}>
              {u.name} · {u.email} · <span className="text-gray-500">{u.role}</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {(["name", "email", "password"] as const).map((field) => (
            <input
              key={field}
              aria-label={field}
              type={field === "password" ? "password" : "text"}
              placeholder={field[0]!.toUpperCase() + field.slice(1)}
              className="rounded border border-gray-300 px-2 py-1"
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
            />
          ))}
          <select
            aria-label="Role"
            className="rounded border border-gray-300 px-2 py-1"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="owner">Owner: everything</option>
            <option value="editor">Editor: builds agents</option>
            <option value="viewer">Viewer: looks and tests</option>
          </select>
        </div>
        <button
          type="button"
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
          onClick={async () => {
            if (await send("/api/business/users", "POST", form, `Added ${form.email}.`)) {
              setForm({ email: "", name: "", password: "", role: "editor" });
            }
          }}
        >
          Add person
        </button>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Your OpenAI key</h2>
        <p className="text-sm text-gray-500">
          {keySet
            ? "Set: your agents use your own key. It is stored encrypted and never shown again."
            : "Not set: your agents use the platform's key."}
        </p>
        <div className="flex gap-2">
          <input
            aria-label="OpenAI API key"
            type="password"
            placeholder="sk-..."
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button
            type="button"
            className="rounded border border-gray-300 px-3 text-sm"
            disabled={apiKey.trim().length < 10}
            onClick={async () => {
              await send(
                "/api/business/secrets",
                "PUT",
                { name: "OPENAI_API_KEY", value: apiKey },
                "Key saved.",
              );
              setApiKey("");
            }}
          >
            Save
          </button>
          {keySet && (
            <button
              type="button"
              className="rounded border border-red-300 px-3 text-sm text-red-700"
              onClick={() =>
                void send(
                  "/api/business/secrets",
                  "PUT",
                  { name: "OPENAI_API_KEY", value: null },
                  "Key removed.",
                )
              }
            >
              Remove
            </button>
          )}
        </div>
      </section>
      {message && (
        <p className={`text-sm ${message.error ? "text-red-600" : "text-emerald-700"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
