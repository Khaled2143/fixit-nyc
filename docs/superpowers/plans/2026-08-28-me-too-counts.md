# Me-Too Counts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in, non-banned user register a one-time "me too" on an issue, and show the resulting count on the map popup and the list card.

**Architecture:** A new `me_toos` table (one row per user per issue, unique-constrained) plus a denormalized `me_too_count` column on `issues`, following the exact shape of the existing `reports` feature. A new `POST /api/issues/[id]/me-too` route does the insert-and-increment; the map popup gets a button to call it, the list card gets a read-only count.

**Tech Stack:** Next.js App Router API routes, Supabase (`supabaseAdmin` service-role client), React (client components), Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-28-me-too-counts-design.md`

## Global Constraints

- Me-too requires a signed-in, non-banned account — no anonymous/per-browser path (spec Non-goals).
- One-way action, no undo — mirrors `reports`, not a toggle.
- No self-me-too blocking — consistent with the existing `Report` button, which doesn't block reporting your own issue either.
- No "already me-too'd" state persisted across page loads — session-only client state, same convention as `reportedIds` in `IssueMap.tsx`. A reload + re-click just doesn't double-count (unique constraint), no error shown.
- `me_too_count` is denormalized on `issues` for cheap reads/future sorting — not computed via a live `count(*)`.
- Vitest only (no Jest); `npm run lint` must pass after any change per `CLAUDE.md`.
- No new Postgres RPC/function — the count increment is a plain read-then-write `UPDATE`, matching this codebase's existing simplicity level (no RPCs exist anywhere else in the project). Under simultaneous me-toos on the same issue within the same instant, one increment could be lost; acceptable for a low-traffic community board and not worth the added machinery.

---

### Task 1: Database schema — `me_toos` table and `me_too_count` column

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: `me_toos` table (`id`, `issue_id`, `user_id`, `created_at`, unique on `(issue_id, user_id)`); `issues.me_too_count` (integer, not null, default 0).

- [ ] **Step 1: Append the schema changes**

Append to the end of `supabase/schema.sql`:

```sql
-- Lets a resident signal "this is happening to me too" on an issue, once
-- per account. Mirrors the reports table exactly: insert-only, deduped
-- by a unique constraint, no RLS policies since only the service-role
-- key (which bypasses RLS) ever touches it.
create table me_toos (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (issue_id, user_id)
);

alter table me_toos enable row level security;

-- No policies: only the service-role key (which bypasses RLS) reads or
-- writes this table.

-- Denormalized counter so the list/map can show a count without a
-- count(*) join on every render. Incremented by the me-too API route.
alter table issues add column me_too_count integer not null default 0;
```

- [ ] **Step 2: Apply the schema to your Supabase project**

Open the Supabase dashboard → SQL Editor → paste the newly-appended block above → Run. Verify: `select * from me_toos limit 1;` returns an empty result with no error, and `select me_too_count from issues limit 1;` returns `0` for existing rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add me_toos table and issues.me_too_count column"
```

---

### Task 2: Data layer — me-too table access, type, and count increment

**Files:**
- Create: `src/lib/meToos.ts`
- Modify: `src/types/issue.ts`
- Modify: `src/lib/issues.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` (`src/lib/supabase/admin.ts`)
- Produces: `insertMeToo(issueId: string, userId: string): Promise<{ inserted: boolean }>`; `Issue.meTooCount: number`; `incrementMeTooCount(id: string, currentCount: number): Promise<void>`

- [ ] **Step 1: Add the me-too data layer**

```ts
// src/lib/meToos.ts
import { supabaseAdmin } from "./supabase/admin";

export async function insertMeToo(issueId: string, userId: string): Promise<{ inserted: boolean }> {
  const { error } = await supabaseAdmin
    .from("me_toos")
    .insert({ issue_id: issueId, user_id: userId });

  if (error) {
    if (error.code === "23505") {
      // Postgres unique_violation — this user already me-too'd this issue.
      return { inserted: false };
    }
    throw error;
  }

  return { inserted: true };
}
```

- [ ] **Step 2: Add `meTooCount` to the `Issue` type**

In `src/types/issue.ts`, find:

```ts
  resolvedVia: string | null;
  resolvedAt: string | null;
  createdAt: string;
```

Replace with:

```ts
  resolvedVia: string | null;
  resolvedAt: string | null;
  meTooCount: number;
  createdAt: string;
```

- [ ] **Step 3: Map and expose `me_too_count` in `src/lib/issues.ts`**

Find the `IssueRow` interface:

```ts
  resolved_via: string | null;
  resolved_at: string | null;
  created_at: string;
```

Replace with:

```ts
  resolved_via: string | null;
  resolved_at: string | null;
  me_too_count: number;
  created_at: string;
```

Find `mapRow`:

```ts
    resolvedVia: row.resolved_via,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
```

Replace with:

```ts
    resolvedVia: row.resolved_via,
    resolvedAt: row.resolved_at,
    meTooCount: row.me_too_count,
    createdAt: row.created_at,
```

Then add a new function at the end of the file, after `hideIssue`:

```ts

export async function incrementMeTooCount(id: string, currentCount: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from("issues")
    .update({ me_too_count: currentCount + 1 })
    .eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: fails with a TypeScript error about `IssueListCard` (or wherever `Issue` is constructed/used) missing `meTooCount` — this is expected since nothing populates or reads it yet outside `issues.ts`. If the only errors are about the new field being unused/missing on components you haven't touched yet in this plan, that's fine; confirm there are no errors *inside* `src/lib/issues.ts`, `src/lib/meToos.ts`, or `src/types/issue.ts` themselves.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meToos.ts src/types/issue.ts src/lib/issues.ts
git commit -m "feat: add me-too data layer and me_too_count field"
```

---

### Task 3: `POST /api/issues/[id]/me-too` route

**Files:**
- Create: `src/app/api/issues/[id]/me-too/route.ts`

**Interfaces:**
- Consumes: `createClient()` (`src/lib/supabase/server.ts`), `getIssueById()` / `incrementMeTooCount()` (`src/lib/issues.ts`, Task 2), `insertMeToo()` (`src/lib/meToos.ts`, Task 2), `getProfile()` (`src/lib/profiles.ts`)
- Produces: `POST /api/issues/:id/me-too` → `{ meToo: true, count: number }` on success; `{ error: string }` with `401`/`403`/`404` on failure.

- [ ] **Step 1: Implement the route**

```ts
// src/app/api/issues/[id]/me-too/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIssueById, incrementMeTooCount } from "@/lib/issues";
import { insertMeToo } from "@/lib/meToos";
import { getProfile } from "@/lib/profiles";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims;

  if (!user) {
    return NextResponse.json({ error: "You must be signed in to me too an issue." }, { status: 401 });
  }

  const profile = await getProfile(user.sub);
  if (profile?.bannedAt) {
    return NextResponse.json(
      { error: "Your account has been suspended for repeated community guideline violations." },
      { status: 403 },
    );
  }

  const issue = await getIssueById(id);
  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const { inserted } = await insertMeToo(id, user.sub);
  if (!inserted) {
    return NextResponse.json({ meToo: true, count: issue.meTooCount });
  }

  await incrementMeTooCount(id, issue.meTooCount);

  return NextResponse.json({ meToo: true, count: issue.meTooCount + 1 });
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: no errors from this route file (unrelated errors about `meTooCount` not yet used in components may still be present until Task 4/5 — that's expected).

- [ ] **Step 3: Manual verification**

Run `npm run dev`. Signed out, `curl -X POST http://localhost:3000/api/issues/<some-real-id>/me-too` → `401`. Signed in (grab the session cookie from the browser, or test via the UI once Task 4 is done) → first call returns `{"meToo":true,"count":1}` (assuming the issue started at 0), a second call with the same account returns `{"meToo":true,"count":1}` again (not `2` — no double count). Confirm via the Supabase dashboard that `me_toos` has exactly one row for that `(issue_id, user_id)` pair and `issues.me_too_count` reads `1`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/issues/[id]/me-too/route.ts"
git commit -m "feat: add me-too API route"
```

---

### Task 4: Me-too button in the map popup

**Files:**
- Modify: `src/components/IssueMap.tsx`

**Interfaces:**
- Consumes: `POST /api/issues/[id]/me-too` (Task 3), `Issue.meTooCount` (Task 2)

- [ ] **Step 1: Add me-too state and handler**

In `src/components/IssueMap.tsx`, find:

```ts
  const [actionError, setActionError] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  const popupIssue = issues.find((issue) => issue.id === popupIssueId) ?? null;

  async function handleReport(issueId: string) {
    setActionError(null);
    const response = await fetch(`/api/issues/${issueId}/report`, { method: "POST" });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setActionError(body.error ?? "Couldn't report this issue.");
      return;
    }

    setReportedIds((prev) => new Set(prev).add(issueId));
    onIssueChanged();
  }
```

Replace with:

```ts
  const [actionError, setActionError] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [meTooedIds, setMeTooedIds] = useState<Set<string>>(new Set());

  const popupIssue = issues.find((issue) => issue.id === popupIssueId) ?? null;

  async function handleReport(issueId: string) {
    setActionError(null);
    const response = await fetch(`/api/issues/${issueId}/report`, { method: "POST" });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setActionError(body.error ?? "Couldn't report this issue.");
      return;
    }

    setReportedIds((prev) => new Set(prev).add(issueId));
    onIssueChanged();
  }

  async function handleMeToo(issueId: string) {
    setActionError(null);
    setMeTooedIds((prev) => new Set(prev).add(issueId));
    const response = await fetch(`/api/issues/${issueId}/me-too`, { method: "POST" });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setActionError(body.error ?? "Couldn't register your me too.");
      setMeTooedIds((prev) => {
        const next = new Set(prev);
        next.delete(issueId);
        return next;
      });
      return;
    }

    onIssueChanged();
  }
```

Note: `handleMeToo` marks the id as done *before* the request resolves (unlike `handleReport`), then rolls back on failure. This closes the double-submit window described in the spec's edge cases (a second click while the first request is in flight would otherwise both succeed against the unique constraint's forgiving `{ inserted: false }` path, wasting a network round trip, though never double-counting).

- [ ] **Step 2: Add the button to the popup**

Find:

```tsx
                <div className="mt-3 flex gap-2">
                  {user && !reportedIds.has(popupIssue.id) && (
                    <button
                      type="button"
                      onClick={() => handleReport(popupIssue.id)}
                      className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Report
                    </button>
                  )}
                  {reportedIds.has(popupIssue.id) && (
                    <span className="text-xs font-mono text-zinc-500">Reported</span>
                  )}
```

Replace with:

```tsx
                <div className="mt-3 flex gap-2">
                  {user && !meTooedIds.has(popupIssue.id) && (
                    <button
                      type="button"
                      onClick={() => handleMeToo(popupIssue.id)}
                      className="rounded-full bg-civic px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Me too · {popupIssue.meTooCount}
                    </button>
                  )}
                  {meTooedIds.has(popupIssue.id) && (
                    <span className="text-xs font-mono text-zinc-500">
                      Counted · {popupIssue.meTooCount}
                    </span>
                  )}
                  {user && !reportedIds.has(popupIssue.id) && (
                    <button
                      type="button"
                      onClick={() => handleReport(popupIssue.id)}
                      className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Report
                    </button>
                  )}
                  {reportedIds.has(popupIssue.id) && (
                    <span className="text-xs font-mono text-zinc-500">Reported</span>
                  )}
```

Note: the displayed count (`popupIssue.meTooCount`) only updates once `onIssueChanged()` (`router.refresh()` in `HomeView`) completes and fresh props arrive — same lag every other popup action already has (e.g. `Reported` doesn't show an updated report count either, since none is displayed). The `Counted` label itself, unlike the count, updates instantly from local state.

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds — this resolves the `meTooCount` usage that Task 2 introduced without a consumer.

- [ ] **Step 4: Run the linter**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`. Signed out: click a pin, confirm no "Me too" button appears. Signed in: click "Me too", confirm the button immediately swaps to "Counted · N" (N being the pre-click count — it'll bump to N+1 after the page's data refreshes). Reload the page and click the same issue's pin again: the button should show fresh ("Me too · N+1", not disabled), since the done-state isn't persisted; clicking it again is harmless (count stays at N+1).

- [ ] **Step 6: Commit**

```bash
git add src/components/IssueMap.tsx
git commit -m "feat: add me-too button to the map popup"
```

---

### Task 5: Me-too count on the list card

**Files:**
- Modify: `src/components/IssueListCard.tsx`

**Interfaces:**
- Consumes: `Issue.meTooCount` (Task 2)

- [ ] **Step 1: Show the count**

In `src/components/IssueListCard.tsx`, find:

```tsx
        {(issue.photoUrl || issue.videoLink) && (
          <div className="mt-1 flex items-center gap-2 text-zinc-400 dark:text-zinc-500">
            {issue.photoUrl && <Camera className="h-3.5 w-3.5" strokeWidth={1.9} />}
            {issue.videoLink && <Video className="h-3.5 w-3.5" strokeWidth={1.9} />}
          </div>
        )}
```

Replace with:

```tsx
        {(issue.photoUrl || issue.videoLink) && (
          <div className="mt-1 flex items-center gap-2 text-zinc-400 dark:text-zinc-500">
            {issue.photoUrl && <Camera className="h-3.5 w-3.5" strokeWidth={1.9} />}
            {issue.videoLink && <Video className="h-3.5 w-3.5" strokeWidth={1.9} />}
          </div>
        )}
        {issue.meTooCount > 0 && (
          <p className="mt-1 text-xs font-mono text-zinc-500">{issue.meTooCount} me too</p>
        )}
```

This is read-only, matching that the list card carries no other write action today (`Report` and `Mark resolved` both live only in the map popup).

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: succeeds with no errors anywhere in the project — this is the last file that needed `meTooCount`.

- [ ] **Step 3: Run the linter**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`. Confirm a card for an issue with at least one me-too shows "N me too" beneath the meta line, and a card for an issue with zero me-toos shows nothing extra (no "0 me too").

- [ ] **Step 5: Commit**

```bash
git add src/components/IssueListCard.tsx
git commit -m "feat: show me-too count on list cards"
```

---

### Task 6: Full test suite and final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all existing tests still pass (no test file was added or changed by this plan — see the spec's Testing section for why: `insertMeToo` and `incrementMeTooCount` are thin Supabase wrappers with no branching logic worth a unit test, matching the untested `insertReport`/`markIssueResolved` precedent).

- [ ] **Step 2: Run the linter and build one more time end-to-end**

Run: `npm run lint && npm run build`
Expected: both succeed cleanly.

- [ ] **Step 3: End-to-end manual walkthrough**

Run `npm run dev`. As a signed-in user: open the map, click a pin, click "Me too", confirm it swaps to "Counted". Reload — confirm the count on that pin's popup increased by one and the list card (if visible) now shows the updated "N me too" line. Sign out and confirm the button disappears from the popup and the count still displays correctly on both the popup and the list card (read access doesn't require sign-in).
