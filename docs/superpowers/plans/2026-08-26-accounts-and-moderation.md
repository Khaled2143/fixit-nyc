# Accounts and Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add magic-link accounts with required usernames, tie issue posting/resolving to accounts, and add automated moderation (profanity filter, photo SafeSearch, community reports → strikes → bans) — all without an admin surface.

**Architecture:** All mutations move behind Next.js API routes using a service-role Supabase client (server-mediated writes); the public anon key is locked down to read-only via RLS. Supabase Auth (magic link) provides identity; a `profiles` table tracks username/strikes/bans; a `reports` table tracks report attribution.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts` — NOT `middleware.ts`), Supabase (Postgres + Auth + Storage), `@supabase/ssr`, `bad-words`, `@google-cloud/vision`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-accounts-and-moderation-design.md`

## Global Constraints

- This Next.js version renamed `middleware.ts` to `proxy.ts` (exported function name `proxy`, not `middleware`) — confirmed by reading `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` in this repo. Never create a `middleware.ts` file.
- Dynamic route handler `params` are `Promise<{...}>` and must be `await`ed (Next.js 15+ behavior, confirmed in this repo's bundled docs).
- `@supabase/ssr` cookie handlers use the `getAll()`/`setAll()` shape (not the older `get`/`set`/`remove` shape).
- Use `supabase.auth.getClaims()` — not `getUser()` — for server-side identity checks in route handlers; the user's ID is `data.claims.sub`. This is what the current official Supabase Next.js example uses, and the docs are explicit that `getClaims()` is required for the proxy's session-refresh to work correctly.
- Keep the existing env var names `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (do not rename to `PUBLISHABLE_KEY`, even though newer Supabase example code uses that name for the same key) — this repo already has these wired up.
- No test suite exists yet; this plan introduces Vitest, per CLAUDE.md's stated convention.
- No admin surface, no claim flow, no "seen" status — do not add any of these (CLAUDE.md).

---

### Task 1: Set up Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Create: `src/lib/linkParsing.test.ts`

**Interfaces:**
- Consumes: `isSupportedVideoLink` from `src/lib/linkParsing.ts` (already exists)
- Produces: a working `npm test` command every later task's test files rely on

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest`

- [ ] **Step 2: Create the Vitest config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 3: Add the test script**

Modify `package.json` `scripts` to add:

```json
"test": "vitest run"
```

- [ ] **Step 4: Write a real test to prove the harness works**

```ts
// src/lib/linkParsing.test.ts
import { describe, expect, it } from "vitest";
import { isSupportedVideoLink } from "./linkParsing";

describe("isSupportedVideoLink", () => {
  it("accepts a TikTok URL", () => {
    expect(isSupportedVideoLink("https://www.tiktok.com/@user/video/123")).toBe(true);
  });

  it("accepts an Instagram URL", () => {
    expect(isSupportedVideoLink("https://instagram.com/reel/abc")).toBe(true);
  });

  it("rejects an unsupported host", () => {
    expect(isSupportedVideoLink("https://youtube.com/watch?v=123")).toBe(false);
  });

  it("rejects a malformed URL", () => {
    expect(isSupportedVideoLink("not a url")).toBe(false);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: 4 passing tests in `src/lib/linkParsing.test.ts`

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/lib/linkParsing.test.ts
git commit -m "test: set up Vitest"
```

---

### Task 2: Database schema — accounts, reports, moderation columns

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: `profiles` table (`id`, `username`, `strikes`, `banned_at`, `created_at`), `reports` table (`id`, `issue_id`, `reporter_id`, `created_at`, unique on `(issue_id, reporter_id)`), `issues.user_id` (nullable — see note), `issues.hidden` (boolean, default false).

**Note on `user_id` nullability:** the spec says "not null going forward." Making the column `NOT NULL` at the database level would break any issues already posted before this migration (they have no owner). This plan adds the column as **nullable** and enforces "every new issue has an owner" at the application layer instead (Task 7 always sets it) — the DB constraint would require a backfill this plan doesn't do, since there's no real user to backfill anonymous historical posts with.

- [ ] **Step 1: Append the schema changes**

Append to the end of `supabase/schema.sql`:

```sql
-- Accounts and moderation -----------------------------------------------

alter table issues add column user_id uuid references auth.users(id);
alter table issues add column hidden boolean not null default false;

-- Posting now requires an account and all writes go through server-side
-- API routes using the service-role key (which bypasses RLS), so the old
-- anonymous-write policy is removed. There is intentionally no
-- insert/update policy for the anon or authenticated roles on `issues`.
drop policy "Public can create issues" on issues;
drop policy "Public can read issues" on issues;

create policy "Public can read visible issues"
  on issues for select
  using (hidden = false);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  strikes int not null default 0,
  banned_at timestamptz,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can read their own profile"
  on profiles for select
  using (auth.uid() = id);

-- No insert/update/delete policy: profile rows are only ever written by
-- the service-role key from API routes.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table reports (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (issue_id, reporter_id)
);

alter table reports enable row level security;

-- No policies: only the service-role key (which bypasses RLS) reads or
-- writes this table.
```

- [ ] **Step 2: Apply the schema to your Supabase project**

Open the Supabase dashboard → SQL Editor → paste the newly-appended block (not the whole file, if the base table already exists) → Run. Verify: `select * from profiles limit 1;` and `select * from reports limit 1;` both return empty results with no error, and `select user_id, hidden from issues limit 1;` returns the new columns.

- [ ] **Step 3: Lock down the photo storage bucket**

The existing `issue-photos` Storage bucket currently allows public/anon uploads (configured via the dashboard, not in `schema.sql`, which is why it isn't visible in this file). In the Supabase dashboard → Storage → `issue-photos` → Policies, delete the existing policy that allows `INSERT` for the `anon` or `public` role. Photo uploads move behind `/api/photos` in Task 8, which uses the service-role key and bypasses Storage RLS entirely, so no replacement insert policy is needed.

Verify after deleting: an anonymous `curl` upload attempt against the bucket now fails. From a terminal:

```bash
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/issue-photos/test.txt" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  --data "test"
```

Expected: a `403` or policy-violation JSON error, not a success response.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add profiles/reports tables and lock down issue writes"
```

---

### Task 3: Supabase client infrastructure (browser, server, admin, session refresh)

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/supabase/proxy.ts`
- Create: `src/proxy.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `createClient()` (browser, from `src/lib/supabase/client.ts`), `createClient()` (server/route-handler, async, from `src/lib/supabase/server.ts`), `supabaseAdmin` (service-role singleton, from `src/lib/supabase/admin.ts`) — every later task's data-layer and route-handler code imports one of these three.

- [ ] **Step 1: Install `@supabase/ssr`**

Run: `npm install @supabase/ssr`

- [ ] **Step 2: Add the new env vars**

Add to `.env.example`:

```
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_APPLICATION_CREDENTIALS_JSON=
```

Add the same two (with real values) to your local `.env.local` — `SUPABASE_SERVICE_ROLE_KEY` is in the Supabase dashboard under Project Settings → API (the "service_role" secret, not the anon key). `GOOGLE_APPLICATION_CREDENTIALS_JSON` isn't needed until Task 8.

While in the dashboard, confirm magic-link sign-in is actually available: Authentication → Providers → Email should be enabled, and Authentication → Providers → Email → "Enable Email OTP" (or equivalent "magic link" toggle, wording varies by dashboard version) should be on. This is on by default for new Supabase projects, but verify rather than assume, since Task 11's sign-in form depends on it.

- [ ] **Step 3: Browser client**

```ts
// src/lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 4: Server (route handler / server component) client**

```ts
// src/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — fine as long as the proxy
            // (src/proxy.ts) is refreshing sessions on every request.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 5: Admin (service-role) client**

```ts
// src/lib/supabase/admin.ts
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
```

- [ ] **Step 6: Session-refresh helper**

```ts
// src/lib/supabase/proxy.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims() — a
  // mistake here can make users randomly logged out. This app has no
  // route-level gating (auth is checked inside individual API routes),
  // so this call exists purely to refresh the session cookie.
  await supabase.auth.getClaims();

  return supabaseResponse;
}
```

- [ ] **Step 7: Root proxy file**

```ts
// src/proxy.ts
import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 8: Verify the build still compiles**

Run: `npm run build`
Expected: build succeeds (these new files aren't imported by anything yet, so this just checks for syntax/type errors).

- [ ] **Step 9: Commit**

```bash
git add src/lib/supabase/client.ts src/lib/supabase/server.ts src/lib/supabase/admin.ts src/lib/supabase/proxy.ts src/proxy.ts .env.example package.json package-lock.json
git commit -m "feat: add Supabase browser/server/admin clients and session-refresh proxy"
```

---

### Task 4: Report → hide → strike → ban decision logic

**Files:**
- Create: `src/lib/reportModeration.ts`
- Test: `src/lib/reportModeration.test.ts`

**Interfaces:**
- Produces: `evaluateReport(reportCountAfterInsert: number, strikesBefore: number): { shouldHide: boolean; strikesAfter: number; shouldBan: boolean }` — consumed by Task 10's report route.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/reportModeration.test.ts
import { describe, expect, it } from "vitest";
import { evaluateReport } from "./reportModeration";

describe("evaluateReport", () => {
  it("does nothing below the report threshold", () => {
    expect(evaluateReport(1, 0)).toEqual({ shouldHide: false, strikesAfter: 0, shouldBan: false });
    expect(evaluateReport(2, 0)).toEqual({ shouldHide: false, strikesAfter: 0, shouldBan: false });
  });

  it("hides the issue and adds a strike when reports reach exactly 3", () => {
    expect(evaluateReport(3, 0)).toEqual({ shouldHide: true, strikesAfter: 1, shouldBan: false });
  });

  it("does not re-trigger past the threshold", () => {
    expect(evaluateReport(4, 1)).toEqual({ shouldHide: false, strikesAfter: 1, shouldBan: false });
  });

  it("bans when the new strike count reaches 3", () => {
    expect(evaluateReport(3, 2)).toEqual({ shouldHide: true, strikesAfter: 3, shouldBan: true });
  });

  it("does not ban below the strike threshold", () => {
    expect(evaluateReport(3, 1)).toEqual({ shouldHide: true, strikesAfter: 2, shouldBan: false });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- reportModeration`
Expected: FAIL — `Cannot find module './reportModeration'`

- [ ] **Step 3: Implement**

```ts
// src/lib/reportModeration.ts
export const REPORT_THRESHOLD = 3;
export const STRIKE_THRESHOLD = 3;

export interface ReportOutcome {
  shouldHide: boolean;
  strikesAfter: number;
  shouldBan: boolean;
}

export function evaluateReport(reportCountAfterInsert: number, strikesBefore: number): ReportOutcome {
  const shouldHide = reportCountAfterInsert === REPORT_THRESHOLD;
  const strikesAfter = shouldHide ? strikesBefore + 1 : strikesBefore;
  const shouldBan = shouldHide && strikesAfter >= STRIKE_THRESHOLD;
  return { shouldHide, strikesAfter, shouldBan };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- reportModeration`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/reportModeration.ts src/lib/reportModeration.test.ts
git commit -m "feat: add report/strike/ban decision logic"
```

---

### Task 5: Issue ownership, visibility, and data-layer updates

**Files:**
- Modify: `src/types/issue.ts`
- Modify: `src/lib/issues.ts`

**Interfaces:**
- Consumes: `createClient()` from `src/lib/supabase/server.ts`, `supabaseAdmin` from `src/lib/supabase/admin.ts` (Task 3)
- Produces: `Issue.userId: string | null`, `Issue.hidden: boolean`; `getIssues(): Promise<Issue[]>` (now filters hidden); `CreateIssueInput.userId: string`; `getIssueById(id: string): Promise<Issue | null>`; `markIssueResolved(id: string): Promise<void>`; `hideIssue(id: string): Promise<void>` — consumed by Tasks 7, 9, 10.

- [ ] **Step 1: Update the `Issue` type**

Modify `src/types/issue.ts` — add two fields to the `Issue` interface:

```ts
export interface Issue {
  id: string;
  category: IssueCategory;
  description: string;
  latitude: number;
  longitude: number;
  address: string | null;
  locationSource: LocationSource;
  status: IssueStatus;
  photoUrl: string | null;
  videoLink: string | null;
  resolvedVia: string | null;
  createdAt: string;
  userId: string | null;
  hidden: boolean;
}
```

- [ ] **Step 2: Rewrite `src/lib/issues.ts`**

```ts
// src/lib/issues.ts
import { createClient } from "./supabase/server";
import { supabaseAdmin } from "./supabase/admin";
import type { Issue, IssueCategory, IssueStatus, LocationSource } from "@/types/issue";

interface IssueRow {
  id: string;
  category: IssueCategory;
  description: string;
  latitude: number;
  longitude: number;
  address: string | null;
  location_source: LocationSource;
  status: IssueStatus;
  photo_url: string | null;
  video_link: string | null;
  resolved_via: string | null;
  created_at: string;
  user_id: string | null;
  hidden: boolean;
}

function mapRow(row: IssueRow): Issue {
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    locationSource: row.location_source,
    status: row.status,
    photoUrl: row.photo_url,
    videoLink: row.video_link,
    resolvedVia: row.resolved_via,
    createdAt: row.created_at,
    userId: row.user_id,
    hidden: row.hidden,
  };
}

export async function getIssues(): Promise<Issue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .eq("hidden", false)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data as IssueRow[]).map(mapRow);
}

export async function getIssueById(id: string): Promise<Issue | null> {
  const { data, error } = await supabaseAdmin
    .from("issues")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as IssueRow) : null;
}

export interface CreateIssueInput {
  category: IssueCategory;
  description: string;
  latitude: number;
  longitude: number;
  address: string | null;
  locationSource: LocationSource;
  videoLink: string | null;
  photoUrl: string | null;
  userId: string;
}

export async function createIssue(input: CreateIssueInput): Promise<Issue> {
  const { data, error } = await supabaseAdmin
    .from("issues")
    .insert({
      category: input.category,
      description: input.description,
      latitude: input.latitude,
      longitude: input.longitude,
      address: input.address,
      location_source: input.locationSource,
      video_link: input.videoLink,
      photo_url: input.photoUrl,
      user_id: input.userId,
    })
    .select()
    .single();

  if (error) throw error;

  return mapRow(data as IssueRow);
}

export async function markIssueResolved(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("issues").update({ status: "resolved" }).eq("id", id);
  if (error) throw error;
}

export async function hideIssue(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("issues").update({ hidden: true }).eq("id", id);
  if (error) throw error;
}
```

Note: `getIssues()` now uses the session-aware server client instead of the old plain anon client — reads still work identically for a logged-out visitor (RLS's `"Public can read visible issues"` policy applies to any role), and `page.tsx`'s existing `await getIssues()` call in a server component works unchanged since `createClient()` is now async.

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: fails at this point — `src/app/api/issues/route.ts` still calls `createIssue()` without a `userId` field, which is now a type error. This is expected; Task 7 fixes it. Confirm the *only* error is the missing `userId` field on the `CreateIssueInput` object literal in that one file.

- [ ] **Step 4: Commit**

```bash
git add src/types/issue.ts src/lib/issues.ts
git commit -m "feat: add issue ownership and visibility to the data layer"
```

---

### Task 6: Usernames and profiles

**Files:**
- Create: `src/lib/username.ts`
- Test: `src/lib/username.test.ts`
- Create: `src/lib/profiles.ts`
- Create: `src/app/api/profile/route.ts`
- Create: `src/app/api/profile/username/route.ts`

**Interfaces:**
- Consumes: `createClient()` from `src/lib/supabase/server.ts`, `supabaseAdmin` from `src/lib/supabase/admin.ts` (Task 3)
- Produces: `isValidUsername(username: string): boolean`; `getProfile(userId: string): Promise<Profile | null>` where `Profile = { id: string; username: string | null; strikes: number; bannedAt: string | null }`; `setUsername(userId: string, username: string): Promise<{ ok: true } | { ok: false; error: string }>`; `updateStrikes(userId: string, strikes: number, banned: boolean): Promise<void>` — consumed by Tasks 7, 10, 11, 12.

- [ ] **Step 1: Write the failing username-validation tests**

```ts
// src/lib/username.test.ts
import { describe, expect, it } from "vitest";
import { isValidUsername } from "./username";

describe("isValidUsername", () => {
  it("accepts a normal username", () => {
    expect(isValidUsername("khaled_99")).toBe(true);
  });

  it("rejects usernames shorter than 3 characters", () => {
    expect(isValidUsername("ab")).toBe(false);
  });

  it("rejects usernames longer than 20 characters", () => {
    expect(isValidUsername("a".repeat(21))).toBe(false);
  });

  it("rejects characters outside letters, numbers, and underscore", () => {
    expect(isValidUsername("bad name!")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- username`
Expected: FAIL — `Cannot find module './username'`

- [ ] **Step 3: Implement the validator**

```ts
// src/lib/username.ts
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- username`
Expected: PASS — 4 tests

- [ ] **Step 5: Add the profiles data layer**

```ts
// src/lib/profiles.ts
import { supabaseAdmin } from "./supabase/admin";

export interface Profile {
  id: string;
  username: string | null;
  strikes: number;
  bannedAt: string | null;
}

interface ProfileRow {
  id: string;
  username: string | null;
  strikes: number;
  banned_at: string | null;
}

function mapProfileRow(row: ProfileRow): Profile {
  return { id: row.id, username: row.username, strikes: row.strikes, bannedAt: row.banned_at };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapProfileRow(data as ProfileRow) : null;
}

export async function setUsername(
  userId: string,
  username: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();

  if (existing && existing.id !== userId) {
    return { ok: false, error: "That username is already taken." };
  }

  const { error } = await supabaseAdmin.from("profiles").update({ username }).eq("id", userId);
  if (error) return { ok: false, error: "Failed to set username." };
  return { ok: true };
}

export async function updateStrikes(userId: string, strikes: number, banned: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      strikes,
      ...(banned ? { banned_at: new Date().toISOString() } : {}),
    })
    .eq("id", userId);

  if (error) throw error;
}
```

- [ ] **Step 6: Add `GET /api/profile`**

```ts
// src/app/api/profile/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profiles";

export async function GET() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims;

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const profile = await getProfile(user.sub);
  return NextResponse.json({
    username: profile?.username ?? null,
    bannedAt: profile?.bannedAt ?? null,
  });
}
```

- [ ] **Step 7: Add `POST /api/profile/username`**

```ts
// src/app/api/profile/username/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidUsername } from "@/lib/username";
import { setUsername } from "@/lib/profiles";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims;

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json();
  const username = typeof body.username === "string" ? body.username.trim() : "";

  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: "Username must be 3-20 characters: letters, numbers, or underscores." },
      { status: 400 },
    );
  }

  const result = await setUsername(user.sub, username);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ username });
}
```

- [ ] **Step 8: Verify the build**

Run: `npm run build`
Expected: same single pre-existing error from Task 5 (missing `userId` in `src/app/api/issues/route.ts`) — no new errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/username.ts src/lib/username.test.ts src/lib/profiles.ts src/app/api/profile/route.ts src/app/api/profile/username/route.ts
git commit -m "feat: add usernames and profile API routes"
```

---

### Task 7: Profanity filter and account-gated issue creation

**Files:**
- Create: `src/lib/profanityFilter.ts`
- Test: `src/lib/profanityFilter.test.ts`
- Modify: `src/app/api/issues/route.ts`

**Interfaces:**
- Consumes: `createClient()` (server.ts), `getProfile()` (profiles.ts), `createIssue()` / `CreateIssueInput` (issues.ts) — all from Tasks 3, 5, 6
- Produces: `containsProfanity(text: string): boolean`

- [ ] **Step 1: Install `bad-words`**

Run: `npm install bad-words`

- [ ] **Step 2: Write the failing profanity-filter tests**

```ts
// src/lib/profanityFilter.test.ts
import { describe, expect, it } from "vitest";
import { containsProfanity } from "./profanityFilter";

describe("containsProfanity", () => {
  it("returns false for a normal description", () => {
    expect(containsProfanity("There's a large pothole outside 123 Main St.")).toBe(false);
  });

  it("returns true when the text contains a blocked word", () => {
    expect(containsProfanity("this pothole is a piece of shit")).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- profanityFilter`
Expected: FAIL — `Cannot find module './profanityFilter'`

- [ ] **Step 4: Implement**

```ts
// src/lib/profanityFilter.ts
import { Filter } from "bad-words";

const filter = new Filter();

export function containsProfanity(text: string): boolean {
  return filter.isProfane(text);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- profanityFilter`
Expected: PASS — 2 tests

- [ ] **Step 6: Add auth/ban/username/profanity checks to `POST /api/issues`**

Replace the full contents of `src/app/api/issues/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createIssue } from "@/lib/issues";
import { isSupportedVideoLink } from "@/lib/linkParsing";
import { containsProfanity } from "@/lib/profanityFilter";
import { getProfile } from "@/lib/profiles";
import { ISSUE_CATEGORIES, LOCATION_SOURCES } from "@/types/issue";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims;

  if (!user) {
    return NextResponse.json({ error: "You must be signed in to post." }, { status: 401 });
  }

  const profile = await getProfile(user.sub);

  if (profile?.bannedAt) {
    return NextResponse.json(
      { error: "Your account has been suspended for repeated community guideline violations." },
      { status: 403 },
    );
  }

  if (!profile?.username) {
    return NextResponse.json({ error: "Set a username before posting." }, { status: 403 });
  }

  const body = await request.json();
  const { category, description, latitude, longitude, address, locationSource, videoLink, photoUrl } = body;

  if (!ISSUE_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  if (typeof description !== "string" || description.trim().length === 0) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }

  if (containsProfanity(description)) {
    return NextResponse.json(
      { error: "Your description contains language that isn't allowed. Please revise it." },
      { status: 400 },
    );
  }

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return NextResponse.json({ error: "Valid latitude and longitude are required" }, { status: 400 });
  }

  if (!LOCATION_SOURCES.includes(locationSource)) {
    return NextResponse.json({ error: "Invalid locationSource" }, { status: 400 });
  }

  if (address !== undefined && address !== null && typeof address !== "string") {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  if (videoLink !== undefined && videoLink !== null) {
    if (typeof videoLink !== "string" || !isSupportedVideoLink(videoLink)) {
      return NextResponse.json(
        { error: "Video link must be a TikTok or Instagram URL" },
        { status: 400 },
      );
    }
  }

  if (photoUrl !== undefined && photoUrl !== null && typeof photoUrl !== "string") {
    return NextResponse.json({ error: "Invalid photoUrl" }, { status: 400 });
  }

  try {
    const issue = await createIssue({
      category,
      description: description.trim(),
      latitude,
      longitude,
      address: address ?? null,
      locationSource,
      videoLink: videoLink ?? null,
      photoUrl: photoUrl ?? null,
      userId: user.sub,
    });

    return NextResponse.json(issue, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create issue" }, { status: 500 });
  }
}
```

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: succeeds with no errors — this was the last file with the pending `userId` type error from Task 5.

- [ ] **Step 8: Commit**

```bash
git add src/lib/profanityFilter.ts src/lib/profanityFilter.test.ts src/app/api/issues/route.ts package.json package-lock.json
git commit -m "feat: gate issue creation behind auth, bans, and a profanity filter"
```

---

### Task 8: Photo moderation and server-mediated photo upload

**Files:**
- Create: `src/lib/photoModeration.ts`
- Test: `src/lib/photoModeration.test.ts`
- Create: `src/app/api/photos/route.ts`
- Modify: `src/lib/storage.ts`
- Delete: `src/lib/supabase.ts`

**Interfaces:**
- Consumes: `createClient()` (server.ts), `supabaseAdmin` (admin.ts) — Task 3
- Produces: `isPhotoSafe(buffer: Buffer): Promise<boolean>`; `uploadPhoto(file: File): Promise<string>` (same signature as before — `SubmitIssueForm.tsx` needs no changes)

- [ ] **Step 1: Create the GCP service account and set the credentials env var**

In the Google Cloud Console: create a project (or use an existing one), enable the "Cloud Vision API" (APIs & Services → Library → search "Cloud Vision API" → Enable), then create a service account (IAM & Admin → Service Accounts → Create Service Account, no special role needed beyond default) and generate a JSON key for it (that service account → Keys → Add Key → JSON). This downloads a `.json` file.

Set `GOOGLE_APPLICATION_CREDENTIALS_JSON` in `.env.local` to the **entire contents of that JSON file, minified to one line** (e.g. `cat downloaded-key.json | jq -c . ` if you have `jq`, or paste it and manually strip newlines). Do not commit this file or its contents anywhere — it's a credential, same as the Supabase service-role key.

- [ ] **Step 2: Install `@google-cloud/vision`**

Run: `npm install @google-cloud/vision`

- [ ] **Step 3: Write the failing photo-moderation tests (mocked Vision client)**

```ts
// src/lib/photoModeration.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isPhotoSafe } from "./photoModeration";

const safeSearchDetection = vi.fn();

vi.mock("@google-cloud/vision", () => ({
  default: {
    ImageAnnotatorClient: vi.fn().mockImplementation(() => ({ safeSearchDetection })),
  },
}));

beforeEach(() => {
  safeSearchDetection.mockReset();
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = '{"type":"service_account"}';
});

describe("isPhotoSafe", () => {
  it("returns true when every category is unlikely", async () => {
    safeSearchDetection.mockResolvedValue([
      { safeSearchAnnotation: { adult: "VERY_UNLIKELY", violence: "UNLIKELY", racy: "UNLIKELY" } },
    ]);
    expect(await isPhotoSafe(Buffer.from("fake"))).toBe(true);
  });

  it("returns false when adult content is likely", async () => {
    safeSearchDetection.mockResolvedValue([
      { safeSearchAnnotation: { adult: "LIKELY", violence: "VERY_UNLIKELY", racy: "UNLIKELY" } },
    ]);
    expect(await isPhotoSafe(Buffer.from("fake"))).toBe(false);
  });

  it("returns false when violence is very likely", async () => {
    safeSearchDetection.mockResolvedValue([
      { safeSearchAnnotation: { adult: "UNLIKELY", violence: "VERY_LIKELY", racy: "UNLIKELY" } },
    ]);
    expect(await isPhotoSafe(Buffer.from("fake"))).toBe(false);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test -- photoModeration`
Expected: FAIL — `Cannot find module './photoModeration'`

- [ ] **Step 5: Implement**

```ts
// src/lib/photoModeration.ts
import vision from "@google-cloud/vision";

const UNSAFE_LIKELIHOODS = new Set(["LIKELY", "VERY_LIKELY"]);

let client: InstanceType<typeof vision.ImageAnnotatorClient> | null = null;

function getClient() {
  if (!client) {
    client = new vision.ImageAnnotatorClient({
      credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON!),
    });
  }
  return client;
}

export async function isPhotoSafe(buffer: Buffer): Promise<boolean> {
  const [result] = await getClient().safeSearchDetection(buffer);
  const safeSearch = result.safeSearchAnnotation;

  if (!safeSearch) return false;

  return ![safeSearch.adult, safeSearch.violence, safeSearch.racy].some(
    (likelihood) => likelihood && UNSAFE_LIKELIHOODS.has(likelihood),
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- photoModeration`
Expected: PASS — 3 tests

- [ ] **Step 7: Add `POST /api/photos`**

```ts
// src/app/api/photos/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isPhotoSafe } from "@/lib/photoModeration";

const PHOTO_BUCKET = "issue-photos";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims;

  if (!user) {
    return NextResponse.json({ error: "You must be signed in to upload a photo." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("photo");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No photo provided" }, { status: 400 });
  }

  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Photo must be a JPEG, PNG, WebP, or HEIC image." },
      { status: 400 },
    );
  }

  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "Photo must be under 5MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let safe: boolean;
  try {
    safe = await isPhotoSafe(buffer);
  } catch {
    return NextResponse.json({ error: "Couldn't process photo, try again." }, { status: 400 });
  }

  if (!safe) {
    return NextResponse.json({ error: "This photo isn't allowed. Try a different one." }, { status: 400 });
  }

  const extension = file.name.split(".").pop();
  const filename = `${randomUUID()}${extension ? `.${extension}` : ""}`;

  const { error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).upload(filename, buffer, {
    contentType: file.type,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to upload photo." }, { status: 500 });
  }

  const { data } = supabaseAdmin.storage.from(PHOTO_BUCKET).getPublicUrl(filename);
  return NextResponse.json({ photoUrl: data.publicUrl });
}
```

- [ ] **Step 8: Rewrite `src/lib/storage.ts` to call the new route instead of Supabase directly**

```ts
// src/lib/storage.ts
export async function uploadPhoto(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("photo", file);

  const response = await fetch("/api/photos", { method: "POST", body: formData });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Failed to upload photo." }));
    throw new Error(body.error ?? "Failed to upload photo.");
  }

  const { photoUrl } = await response.json();
  return photoUrl;
}
```

`SubmitIssueForm.tsx` needs no changes — it already calls `uploadPhoto(photo)` and handles the thrown-error case identically.

- [ ] **Step 9: Delete the now-unused plain anon client**

Run: `rm src/lib/supabase.ts`

Nothing imports it anymore: `src/lib/issues.ts` was moved to the new clients in Task 5, and `src/lib/storage.ts` no longer imports Supabase at all as of the previous step.

- [ ] **Step 10: Verify the build**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 11: Manual verification**

Run `npm run dev`, open the report form, attach a real (safe) photo, and submit. Confirm the photo appears in the map popup exactly as before. This exercises the whole new upload path end to end (requires `GOOGLE_APPLICATION_CREDENTIALS_JSON` and `SUPABASE_SERVICE_ROLE_KEY` to be set locally).

- [ ] **Step 12: Commit**

```bash
git add src/lib/photoModeration.ts src/lib/photoModeration.test.ts src/app/api/photos/route.ts src/lib/storage.ts package.json package-lock.json
git rm src/lib/supabase.ts
git commit -m "feat: move photo upload behind SafeSearch moderation"
```

---

### Task 9: Resolve endpoint

**Files:**
- Create: `src/app/api/issues/[id]/resolve/route.ts`

**Interfaces:**
- Consumes: `createClient()` (server.ts), `getIssueById()` / `markIssueResolved()` (issues.ts) — Tasks 3, 5

- [ ] **Step 1: Implement the route**

```ts
// src/app/api/issues/[id]/resolve/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIssueById, markIssueResolved } from "@/lib/issues";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims;

  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const issue = await getIssueById(id);
  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  if (issue.userId !== user.sub) {
    return NextResponse.json({ error: "You can't resolve someone else's report." }, { status: 403 });
  }

  await markIssueResolved(id);
  return NextResponse.json({ status: "resolved" });
}
```

- [ ] **Step 2: Manual verification**

Run `npm run dev`, sign in, post an issue, then send a PATCH to `/api/issues/<that-issue-id>/resolve` (e.g. via the browser devtools console: `fetch('/api/issues/ISSUE_ID/resolve', { method: 'PATCH' }).then(r => r.json()).then(console.log)`). Confirm it returns `{ "status": "resolved" }` and that re-fetching the map shows the pin at reduced opacity (the existing `status === "resolved"` styling in `IssueMap.tsx` already handles this). Then try it against an issue you don't own (or while signed out) and confirm 403/401.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/issues/[id]/resolve/route.ts
git commit -m "feat: add issue resolve endpoint, owner-only"
```

---

### Task 10: Reports and the report endpoint

**Files:**
- Create: `src/lib/reports.ts`
- Create: `src/app/api/issues/[id]/report/route.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` (admin.ts), `createClient()` (server.ts), `getIssueById()` / `hideIssue()` (issues.ts), `getProfile()` / `updateStrikes()` (profiles.ts), `evaluateReport()` (reportModeration.ts) — Tasks 3, 4, 5, 6
- Produces: `insertReport(issueId: string, reporterId: string): Promise<{ inserted: boolean }>`; `countReports(issueId: string): Promise<number>`

- [ ] **Step 1: Add the reports data layer**

```ts
// src/lib/reports.ts
import { supabaseAdmin } from "./supabase/admin";

export async function insertReport(issueId: string, reporterId: string): Promise<{ inserted: boolean }> {
  const { error } = await supabaseAdmin
    .from("reports")
    .insert({ issue_id: issueId, reporter_id: reporterId });

  if (error) {
    if (error.code === "23505") {
      // Postgres unique_violation — this user already reported this issue.
      return { inserted: false };
    }
    throw error;
  }

  return { inserted: true };
}

export async function countReports(issueId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("reports")
    .select("*", { count: "exact", head: true })
    .eq("issue_id", issueId);

  if (error) throw error;
  return count ?? 0;
}
```

- [ ] **Step 2: Implement the report route**

```ts
// src/app/api/issues/[id]/report/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIssueById, hideIssue } from "@/lib/issues";
import { insertReport, countReports } from "@/lib/reports";
import { getProfile, updateStrikes } from "@/lib/profiles";
import { evaluateReport } from "@/lib/reportModeration";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims;

  if (!user) {
    return NextResponse.json({ error: "You must be signed in to report an issue." }, { status: 401 });
  }

  const reporterProfile = await getProfile(user.sub);
  if (reporterProfile?.bannedAt) {
    return NextResponse.json(
      { error: "Your account has been suspended for repeated community guideline violations." },
      { status: 403 },
    );
  }

  const issue = await getIssueById(id);
  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const { inserted } = await insertReport(id, user.sub);
  if (!inserted) {
    return NextResponse.json({ reported: true });
  }

  const reportCount = await countReports(id);
  const posterProfile = issue.userId ? await getProfile(issue.userId) : null;
  const outcome = evaluateReport(reportCount, posterProfile?.strikes ?? 0);

  if (outcome.shouldHide) {
    await hideIssue(id);
    if (issue.userId) {
      await updateStrikes(issue.userId, outcome.strikesAfter, outcome.shouldBan);
    }
  }

  return NextResponse.json({ reported: true });
}
```

Note: `issue.userId` can be `null` for issues posted before this migration (Task 2 added `user_id` as nullable rather than backfilling). Reporting still hides the issue in that case; there's just no poster to strike.

- [ ] **Step 3: Manual verification**

Sign in as three different accounts (or reuse the same account against three different test issues if you don't want to create three real accounts) and confirm: the first two reports on one issue do nothing observable; the third hides it (re-fetch `/` and confirm the pin is gone) and, if the poster is a real account, their `strikes` column in the `profiles` table (check via Supabase dashboard) increments by 1. Reporting the same issue twice as the same user should return `{"reported":true}` both times without incrementing anything extra.

- [ ] **Step 4: Commit**

```bash
git add src/lib/reports.ts src/app/api/issues/[id]/report/route.ts
git commit -m "feat: add community reporting with auto-hide and strikes"
```

---

### Task 11: Sign-in UI

**Files:**
- Create: `src/lib/useSupabaseUser.ts`
- Create: `src/components/SignInForm.tsx`
- Create: `src/components/AuthStatus.tsx`
- Modify: `src/components/HomeView.tsx`

**Interfaces:**
- Consumes: `createClient()` from `src/lib/supabase/client.ts` (Task 3)
- Produces: `useSupabaseUser(): { user: User | null; loading: boolean }` — consumed by Task 12's onboarding/gating and Task 13's map buttons.

- [ ] **Step 1: Add the auth-state hook**

```ts
// src/lib/useSupabaseUser.ts
"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function useSupabaseUser(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return { user, loading };
}
```

- [ ] **Step 2: Add the sign-in form**

```tsx
// src/components/SignInForm.tsx
"use client";

import { useState, type FormEvent } from "react";
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
      options: { emailRedirectTo: window.location.origin },
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
      <p className="text-sm text-ink dark:text-white">
        Check your email for a sign-in link.
      </p>
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
```

- [ ] **Step 3: Add the auth status corner button**

```tsx
// src/components/AuthStatus.tsx
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
```

- [ ] **Step 4: Wire it into `HomeView`**

Replace the full contents of `src/components/HomeView.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Issue } from "@/types/issue";
import { IssueMap } from "@/components/IssueMap";
import { IssueReportModal } from "@/components/IssueReportModal";
import { SubmitIssueForm } from "@/components/SubmitIssueForm";
import { AuthStatus } from "@/components/AuthStatus";
import { SignInForm } from "@/components/SignInForm";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

export function HomeView({ issues }: { issues: Issue[] }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const { user } = useSupabaseUser();

  return (
    <>
      <AuthStatus user={user} onSignInClick={() => setSignInOpen(true)} />
      <IssueMap
        issues={issues}
        user={user}
        onReportIssue={() => setModalOpen(true)}
        onIssueChanged={() => router.refresh()}
      />
      <IssueReportModal open={modalOpen} onClose={() => setModalOpen(false)}>
        <SubmitIssueForm
          user={user}
          onSuccess={() => {
            setModalOpen(false);
            router.refresh();
          }}
        />
      </IssueReportModal>
      <IssueReportModal open={signInOpen} onClose={() => setSignInOpen(false)}>
        <div className="px-6 py-6 sm:px-7 sm:py-7">
          <SignInForm />
        </div>
      </IssueReportModal>
    </>
  );
}
```

This passes `user` and a new `onIssueChanged` callback down to `IssueMap` (used by Task 13's report/resolve buttons) and `user` down to `SubmitIssueForm` (used by Task 12's gating). Both components get their new props added in later tasks — this task only wires the plumbing that doesn't exist yet, so the build will show two "prop does not exist" type errors until Tasks 12 and 13 land; that's expected and called out in Step 5.

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: two type errors — `<IssueMap>` doesn't accept a `user` or `onIssueChanged` prop yet, and `<SubmitIssueForm>` doesn't accept a `user` prop yet. Confirm these are the *only* errors; they're resolved in Tasks 12 and 13.

- [ ] **Step 6: Commit**

```bash
git add src/lib/useSupabaseUser.ts src/components/SignInForm.tsx src/components/AuthStatus.tsx src/components/HomeView.tsx
git commit -m "feat: add magic-link sign-in UI"
```

---

### Task 12: Username onboarding and form gating

**Files:**
- Create: `src/lib/useProfile.ts`
- Create: `src/components/UsernameOnboarding.tsx`
- Modify: `src/components/SubmitIssueForm.tsx`

**Interfaces:**
- Consumes: `useSupabaseUser()` (Task 11), `GET /api/profile` / `POST /api/profile/username` (Task 6)
- Produces: `useProfile(user: User | null): { profile: { username: string | null; bannedAt: string | null } | null; loading: boolean; refresh: () => void }`

- [ ] **Step 1: Add the profile-fetching hook**

```ts
// src/lib/useProfile.ts
"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

interface ProfileState {
  username: string | null;
  bannedAt: string | null;
}

export function useProfile(user: User | null): {
  profile: ProfileState | null;
  loading: boolean;
  refresh: () => void;
} {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setProfile(data))
      .finally(() => setLoading(false));
  }, [user, refreshKey]);

  return { profile, loading, refresh: () => setRefreshKey((k) => k + 1) };
}
```

- [ ] **Step 2: Add the username onboarding screen**

```tsx
// src/components/UsernameOnboarding.tsx
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
```

- [ ] **Step 3: Gate `SubmitIssueForm` on sign-in, onboarding, and bans**

Modify `src/components/SubmitIssueForm.tsx`:

1. Add the import at the top:

```ts
import type { User } from "@supabase/supabase-js";
import { useProfile } from "@/lib/useProfile";
import { SignInForm } from "@/components/SignInForm";
import { UsernameOnboarding } from "@/components/UsernameOnboarding";
```

2. Change the function signature from `export function SubmitIssueForm({ onSuccess }: { onSuccess: () => void }) {` to:

```ts
export function SubmitIssueForm({
  user,
  onSuccess,
}: {
  user: User | null;
  onSuccess: () => void;
}) {
  const { profile, loading: profileLoading, refresh: refreshProfile } = useProfile(user);
```

(keep every existing `useState` line below this exactly as-is)

3. Immediately before the existing `return (` statement (the one that renders the full form), insert the gating logic:

```tsx
  if (!user) {
    return (
      <div className="px-6 py-6 sm:px-7 sm:py-7">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink dark:text-white">
          Sign in to post
        </h1>
        <div className="mt-6">
          <SignInForm />
        </div>
      </div>
    );
  }

  if (profileLoading) {
    return <div className="px-6 py-6 sm:px-7 sm:py-7">Loading...</div>;
  }

  if (profile?.bannedAt) {
    return (
      <div className="px-6 py-6 sm:px-7 sm:py-7">
        <p className="text-sm text-ink dark:text-white">
          Your account has been suspended for repeated community guideline violations.
        </p>
      </div>
    );
  }

  if (!profile?.username) {
    return (
      <div className="px-6 py-6 sm:px-7 sm:py-7">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink dark:text-white">
          Pick a username
        </h1>
        <div className="mt-6">
          <UsernameOnboarding onDone={refreshProfile} />
        </div>
      </div>
    );
  }
```

4. Remove the now-inaccurate copy in the existing return block — find:

```tsx
        <p className="mt-1 font-mono text-xs tracking-wide text-zinc-500 uppercase">
          No account needed · posts publicly
        </p>
```

and delete those three lines entirely (no replacement — the heading "Report an issue" reads fine on its own).

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: succeeds — this resolves the `SubmitIssueForm` prop error from Task 11 Step 5. (The `IssueMap` prop error remains until Task 13.)

- [ ] **Step 5: Manual verification**

Run `npm run dev`. Signed out, open the report modal → see the sign-in form. Sign in via the emailed magic link → back on the site, reopen the modal → see the username picker. Submit a username → the actual report form appears. Reload the page and reopen the modal → the form appears immediately (no onboarding repeat) since the profile now has a username.

- [ ] **Step 6: Commit**

```bash
git add src/lib/useProfile.ts src/components/UsernameOnboarding.tsx src/components/SubmitIssueForm.tsx
git commit -m "feat: add username onboarding and gate the report form on it"
```

---

### Task 13: Report and resolve buttons in the map popup

**Files:**
- Modify: `src/components/IssueMap.tsx`

**Interfaces:**
- Consumes: `user: User | null` prop (from `HomeView`, Task 11), `POST /api/issues/[id]/report` (Task 10), `PATCH /api/issues/[id]/resolve` (Task 9)

- [ ] **Step 1: Update the component signature and imports**

In `src/components/IssueMap.tsx`, change the import line:

```ts
import { useEffect, useState } from "react";
```

to:

```ts
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
```

Change the function signature from:

```ts
export function IssueMap({
  issues,
  onReportIssue,
}: {
  issues: Issue[];
  onReportIssue: () => void;
}) {
```

to:

```ts
export function IssueMap({
  issues,
  user,
  onReportIssue,
  onIssueChanged,
}: {
  issues: Issue[];
  user: User | null;
  onReportIssue: () => void;
  onIssueChanged: () => void;
}) {
```

- [ ] **Step 2: Add report/resolve state and handlers**

Immediately after the existing `const colorScheme = useColorScheme();` line, add:

```ts
  const [actionError, setActionError] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

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

  async function handleResolve(issueId: string) {
    setActionError(null);
    const response = await fetch(`/api/issues/${issueId}/resolve`, { method: "PATCH" });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setActionError(body.error ?? "Couldn't resolve this issue.");
      return;
    }

    setSelected(null);
    onIssueChanged();
  }
```

- [ ] **Step 3: Add the buttons to the popup**

Inside the `<Popup>` block, immediately after the closing `</div>` of the `videoLink` conditional (i.e. right before the final `</div>` that closes the popup content wrapper, just before `</Popup>`), add:

```tsx
                {actionError && <p className="mt-2 text-sm text-signal">{actionError}</p>}

                <div className="mt-3 flex gap-2">
                  {user && !reportedIds.has(selected.id) && (
                    <button
                      type="button"
                      onClick={() => handleReport(selected.id)}
                      className="rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-ink dark:border-zinc-700 dark:text-white"
                    >
                      Report
                    </button>
                  )}
                  {reportedIds.has(selected.id) && (
                    <span className="text-xs font-mono text-zinc-500">Reported</span>
                  )}
                  {user && user.id === selected.userId && selected.status !== "resolved" && (
                    <button
                      type="button"
                      onClick={() => handleResolve(selected.id)}
                      className="rounded-full bg-civic px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Mark resolved
                    </button>
                  )}
                </div>
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: succeeds with no errors — this resolves the last `<IssueMap>` prop error from Task 11.

- [ ] **Step 5: Run the linter**

Run: `npm run lint`
Expected: no errors (per CLAUDE.md's instruction to run lint after any change).

- [ ] **Step 6: Manual verification**

Run `npm run dev`. Signed out: click a pin, confirm no Report/Resolve buttons appear. Signed in as a non-owner: confirm a "Report" button appears and clicking it once shows "Reported" instead. Signed in as the owner of an unresolved issue: confirm a "Mark resolved" button appears; clicking it closes the popup and the pin fades per the existing resolved styling.

- [ ] **Step 7: Commit**

```bash
git add src/components/IssueMap.tsx
git commit -m "feat: add report and resolve actions to the map popup"
```

---

## Post-plan note

This plan makes one deliberate deviation from the spec's literal wording: `issues.user_id` is added as **nullable**, not `NOT NULL` (see Task 2's note). The application still guarantees every *new* issue has an owner (Task 7 always sets it); the DB-level constraint is loosened only so this migration doesn't break issues already posted before it runs.
