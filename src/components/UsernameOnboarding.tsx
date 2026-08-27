"use client";

import { useState, type FormEvent } from "react";

export function UsernameOnboarding({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const response = await fetch("/api/profile/username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });

    setSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Something went wrong.");
      return;
    }

    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink dark:text-white">
          Pick a username
        </span>
        <input
          required
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="3-20 letters, numbers, or underscores"
          className="rounded border border-rule px-3 py-3 text-base text-ink dark:border-zinc-700 dark:bg-black dark:text-white"
        />
      </label>
      {error && <p className="text-sm text-signal">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-signal px-4 py-3.5 text-base font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Saving..." : "Continue"}
      </button>
    </form>
  );
}
