"use client";

import { useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { confirmSignIn } from "@/app/auth/confirm/actions";

export function ConfirmSignInButton({
  tokenHash,
  type,
  next,
}: {
  tokenHash: string;
  type: EmailOtpType;
  next: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await confirmSignIn(tokenHash, type, next);
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="w-full rounded-full bg-signal px-6 py-3.5 text-base font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Signing in..." : "Confirm sign-in"}
      </button>
      {error && (
        <p className="text-sm text-signal">Something went wrong. Try requesting a new link.</p>
      )}
    </div>
  );
}
