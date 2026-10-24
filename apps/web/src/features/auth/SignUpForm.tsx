"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function SignUpForm() {
  const router = useRouter();
  const [form, setForm] = useState({ businessName: "", name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const field = (key: keyof typeof form, label: string, type = "text", autoComplete?: string) => (
    <div>
      <label className="label" htmlFor={key}>
        {label}
      </label>
      <input
        id={key}
        aria-label={label}
        type={type}
        autoComplete={autoComplete}
        required
        className="input"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setPending(false);
    const body = (await response.json()) as { error?: string; issues?: { message: string }[] };
    if (!response.ok) {
      setError(body.issues?.[0]?.message ?? body.error ?? "Couldn't create the account.");
      return;
    }
    router.replace("/connect");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {field("businessName", "Business name", "text", "organization")}
      {field("name", "Your name", "text", "name")}
      {field("email", "Work email", "email", "email")}
      {field("password", "Password (10+ characters)", "password", "new-password")}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}
