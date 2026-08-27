"use client";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function AuthStatus({
  user,
  onSignInClick,
}: {
  user: User | null;
  onSignInClick: () => void;
}) {
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={onSignInClick}
        className="absolute top-4 left-4 z-10 rounded-full bg-paper px-4 py-2 text-sm font-medium text-ink shadow-lg dark:bg-slate dark:text-white"
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-full bg-paper px-4 py-2 text-sm font-medium text-ink shadow-lg dark:bg-slate dark:text-white">
      <span>{user.email}</span>
      <button type="button" onClick={handleSignOut} className="text-civic underline">
        Sign out
      </button>
    </div>
  );
}
