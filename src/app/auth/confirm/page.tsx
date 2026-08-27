import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { ConfirmSignInButton } from "@/components/ConfirmSignInButton";

// This page requires a real click before calling verifyOtp (see
// ConfirmSignInButton) rather than verifying as soon as the link loads.
// Magic-link tokens are single-use, and email security scanners (Outlook
// Safe Links, corporate gateways, etc.) auto-GET every link in an email to
// scan it - which silently burns the token before the recipient clicks it.
// Requiring a click defeats GET-only scanners without breaking the link
// for humans.
export default async function ConfirmSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next: rawNext } = await searchParams;
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (!token_hash || !type) {
    redirect("/?auth_error=1");
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-paper px-6 dark:bg-slate">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-rule bg-white px-8 py-10 text-center shadow-lg dark:border-zinc-700 dark:bg-black">
        <p className="text-xs font-bold tracking-widest text-signal uppercase">FixIt NYC</p>
        <h1 className="text-xl font-bold text-ink dark:text-white">Confirm your sign-in</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          For your security, click below to finish signing in on this device.
        </p>
        <ConfirmSignInButton tokenHash={token_hash} type={type as EmailOtpType} next={next} />
      </div>
    </div>
  );
}
