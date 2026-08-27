"use client";

import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });

    setSubmitting(false);

    if (signInError) {
      setError("Couldn't send the sign-in link. Try again.");
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-rule bg-paper px-6 py-8 text-center dark:border-zinc-700 dark:bg-black">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-civic/10 text-civic dark:bg-civic/20">
          <Mail size={24} />
        </div>
        <p className="text-lg font-semibold text-ink dark:text-white">
          Check your email for a sign-in link
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Don&apos;t see it? Check your spam or junk folder — it can take a minute to arrive.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink dark:text-white">Sign in with email</span>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="rounded border border-rule px-3 py-3 text-base text-ink dark:border-zinc-700 dark:bg-black dark:text-white"
        />
      </label>
      {error && <p className="text-sm text-signal">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-signal px-4 py-3.5 text-base font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Sending..." : "Send sign-in link"}
      </button>
    </form>
  );
}
