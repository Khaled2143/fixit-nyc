# Accounts and Moderation — Design

## Context

fixit-nyc launched fully anonymous: anyone could post an issue with no
account, and nothing existed to mark an issue resolved. After posting the
project to Reddit and getting real traffic, people posted junk/offensive
content and there was no way to hold anyone accountable or let the original
poster close out their own report. This design adds lightweight accounts,
ties posting/resolving to an account, and adds automated moderation —
without building an admin surface, matching the existing CLAUDE.md
constraint that there is currently no admin/official-facing surface and
none should be scaffolded.

## Goals

- Every new issue is tied to an account (email identity via magic link,
  plus a required username).
- Only the original poster can mark their own issue resolved.
- Automated defenses against the abuse already observed: junk/offensive
  text, junk/offensive photos, and (once resolve exists) false resolves —
  the last one handled by ownership restriction, not moderation.
- No manual moderation queue, no admin login, no human-in-the-loop review.
  Everything here is either blocked synchronously at submit time or
  resolved automatically by report volume.
- Capture a username now so a future leaderboard doesn't need a backfill.

## Non-goals

- No admin dashboard or official-facing surface (unchanged from CLAUDE.md).
- No appeal flow for filtered posts or bans.
- No leaderboard itself — only the username data it will need.
- No profile pages beyond the username, no avatars, no social features.
- No moderation of video links — we never host video, so there's nothing
  to filter; the link is always external.

## Auth

- **Provider**: Supabase Auth, magic link only. No password, no OAuth.
  Chosen over Google OAuth for lower setup/maintenance overhead (no OAuth
  app registration or consent-screen verification) given this is a
  solo-maintained project. Google can be added later as a second provider
  without changing the auth model.
- **Session**: `@supabase/ssr` for Next.js App Router — session lives in
  cookies, readable by server components (for reads) and API routes (for
  auth checks).
- **Onboarding**: immediately after a user's first magic-link sign-in,
  before they can post, report, or resolve anything, they hit a one-time
  "Pick a username" screen. Username is required, not optional.
- **Gating**: Browsing the public map requires no login. Posting an issue,
  uploading a photo, resolving an issue, and reporting an issue all require
  a session with a username already set.

## Data model

New tables:

- **`profiles`** — `id` (PK, references `auth.users`), `username` (text,
  unique case-insensitively, required, ~3–20 chars, letters/numbers/
  underscore), `strikes` (int, default 0), `banned_at` (timestamptz,
  nullable). Row created via a trigger on `auth.users` insert (standard
  Supabase pattern), with `username` populated once the onboarding step
  completes rather than at trigger time. Username is editable later — not
  locked permanently.
- **`reports`** — `id`, `issue_id` (references `issues`), `reporter_id`
  (references `auth.users`), `created_at`. Unique constraint on
  `(issue_id, reporter_id)` — one report per user per issue.

Changes to **`issues`**:

- Add `user_id` (references `auth.users`, **not null** going forward).
- Add `hidden` (boolean, default `false`) — set when an issue crosses the
  report threshold. Kept separate from `status` (`submitted`/`resolved`)
  because it's a moderation/visibility flag, not a lifecycle state; this
  preserves the existing simple status model and the future `resolvedVia`
  plan untouched.

RLS: the public `anon` key is locked down to read-only access on
non-hidden `issues` rows. No direct client writes to `issues`, `reports`,
or `profiles` — all mutations go through server-side API routes using the
service-role key (see Architecture below).

## Architecture: server-mediated writes

Current state: issue creation already goes through `POST /api/issues`, but
photo upload (`src/lib/storage.ts` → `uploadPhoto`) goes **directly from
the browser to Supabase Storage** using the public anon key, bypassing the
Next.js server entirely.

This has to change for two reasons:

1. Google Vision SafeSearch moderation must run **before** a photo is
   accepted, which isn't possible if the browser talks to Storage
   directly.
2. Once moderation logic lives in the API layer, it can't be the only line
   of defense — the anon key is public, so if direct writes remain
   possible, they'd bypass every check added here.

**Decision**: all mutations (create issue, upload photo, resolve, report,
set username) go through Next.js API routes. Each route verifies the
Supabase Auth session server-side, runs its checks in code (ownership, ban
status, profanity filter, Vision SafeSearch), then writes using a
server-only service-role Supabase client. The anon key is locked down via
RLS to allow no direct writes at all.

Alternative considered: keep direct client→Supabase writes and enforce
everything via Postgres RLS policies (bans, ownership) instead of API
code. Rejected because photo upload still has to move server-side for the
Vision check regardless, making a "pure RLS" approach a hybrid anyway —
and splitting authorization logic between SQL policies and app code is
harder for a solo dev to reason about than keeping it all in one place.

## API routes

**`POST /api/profile/username`** (new)
- 401 if no session.
- Validates uniqueness (case-insensitive) and format; 400 with a specific
  message on conflict or invalid format.
- Sets `profiles.username`. Used both for first-time onboarding and later
  edits.

**`POST /api/issues`** (existing, modified)
- 401 if no session; 403 if `profiles.username` is not yet set (onboarding
  incomplete).
- 403 if `profiles.banned_at` is set.
- Runs `description` through a local profanity-filter library (denylist,
  no external call) before the existing validation; 400 if it hits, no
  strike issued — this just blocks the post, matching the earlier decision
  that the profanity filter should stop the post, not escalate it.
- Sets `user_id` from the session.

**`POST /api/photos`** (new — replaces direct browser→Storage upload)
- 401 if no session.
- Sends the image to Google Cloud Vision SafeSearch; 400 if flagged, no
  strike issued (same "block, don't escalate" pattern as the text filter).
- On success, uploads to Supabase Storage via the service-role key and
  returns the public URL — same shape the client already expects from the
  old `uploadPhoto()`.
- If the Vision call itself fails (network/quota), fail closed: reject the
  upload rather than accepting an unchecked image.

**`PATCH /api/issues/[id]/resolve`** (new)
- 401 if no session; 403 if the session user isn't the issue's `user_id`.
- Sets `status = "resolved"`. Leaves `resolvedVia` as `null` — that field
  stays reserved for the future AI-inferred-resolution flow and is not
  touched by this manual path.

**`POST /api/issues/[id]/report`** (new)
- 401 if no session; 403 if banned.
- Inserts into `reports`; a duplicate `(issue_id, reporter_id)` no-ops
  (return success, not an error — no need to tell someone they already
  reported it).
- Counts reports for the issue. On reaching exactly 3: sets
  `hidden = true` on the issue and increments the poster's `strikes` by 1.
- If the poster's `strikes` reaches 3: sets `banned_at = now()` on their
  profile.

## Moderation summary

| Trigger | Effect | Strike issued? |
|---|---|---|
| Profanity filter hits on submit | Post rejected, user can edit and resubmit | No |
| Google Vision flags a photo | Upload rejected, user can pick another photo | No |
| An issue reaches 3 reports | Issue hidden from public map | Yes (to the poster) |
| Poster reaches 3 strikes | Account banned (`banned_at` set) | — |

Rationale: filters that block *before* anything is stored don't need to
also punish — the user just didn't get to post that specific thing.
Strikes are reserved for content that got through and was independently
flagged by the community, which is the actual abuse signal.

## Photo moderation service

**Google Cloud Vision SafeSearch**, chosen over Claude vision for this use
case: it's a purpose-built fixed-category classifier (adult/violence/racy
content), which is all this needs, and is meaningfully cheaper — first
1,000 images/month free, then $1.50/1,000 — for a project at this traffic
scale. Claude vision remains an option later if more contextual judgment
is ever needed, but isn't justified for a first pass.

## UI changes

- New sign-in affordance (top-left, mirroring the existing top-right
  "+ Report an issue" button): "Sign in" when logged out, or username +
  "Sign out" when logged in.
- New one-time onboarding screen: username picker, shown right after first
  sign-in, before any other action is available.
- `SubmitIssueForm`: remove the "No account needed · posts publicly"
  copy. If not signed in when the report modal opens, show a sign-in step
  (email → "check your email") before the form; if signed in but without a
  username, show the onboarding screen instead. Swap the client-side
  `uploadPhoto()` call for a call to `/api/photos`.
- Map popup (`IssueMap.tsx`): add a "Report" action, gated the same way as
  posting (prompts sign-in/onboarding if needed); add a "Mark resolved"
  action shown only when the signed-in user owns the issue.
- Banned users hitting any protected action see a plain suspension message
  instead of the normal form/action — no appeal flow.

## New setup required

- Enable email/magic-link provider in the Supabase Auth dashboard.
- Create a GCP project + service account with the Vision API enabled;
  store credentials in a server-only env var, never exposed to the client.
- New server-only `SUPABASE_SERVICE_ROLE_KEY` env var for privileged API
  route writes, separate from the existing public anon key.
- New dependencies: `@supabase/ssr`, a profanity-filter library (e.g.
  `bad-words`), and a Google Cloud Vision client (`@google-cloud/vision`
  or a plain REST call).

## Testing

No test suite exists yet (Vitest is the project's chosen convention once
one exists). For this feature, add Vitest coverage for the pieces of real
branching logic:

- The report-threshold → hide → strike → ban state transition, given
  various prior report/strike counts.
- The profanity-filter gate (does/doesn't block, given sample input).
- Username validation (format + uniqueness conflict handling).

Everything else (auth redirects, API plumbing, UI gating) is better
verified by running the app manually than by testing framework glue.
