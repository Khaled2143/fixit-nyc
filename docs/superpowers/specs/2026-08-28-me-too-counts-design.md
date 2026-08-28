# Me-Too Counts — Design

## Context

Issues currently have no way for other residents to signal "this is
happening to me too" — no schema, no API route, no UI. The
`2026-08-27-browsable-issue-list-design.md` spec explicitly deferred this
as its own sub-project. A visual-direction moodboard (`FixIt NYC - Visual
Direction.html`, untracked, dropped at the repo root) shows a "ME TOO"
button with a count on nearly every card and popup, and calls out the
dedup mechanism as an open question: per-browser (localStorage) or
server-side per-account. That question is resolved below.

The existing `reports` feature already solves an identical problem — one
action per user per issue, insert-only, no undo — so this design mirrors
it directly rather than inventing a new pattern.

## Goals

- Let a signed-in, non-banned user register a "me too" on an issue,
  once per account.
- Show the resulting count on both the map popup and the list card.
- Keep the action one-way (no un-me-too), matching `reports`.

## Non-goals

- **Sort-by-me-too-count** — a separate, smaller follow-up once the
  count exists. Not addressed here.
- **Anonymous/per-browser me-too** — rejected. The moodboard's "no
  account needed" framing for the report flow doesn't match how issue
  creation and reporting actually work in this app (both already require
  a signed-in, non-banned account per `CLAUDE.md`); me-too follows the
  same rule for consistency and to keep the count authoritative rather
  than spoofable.
- **Blocking self-me-too** — not special-cased, matching the existing
  `Report` button, which doesn't block reporting your own issue either.
- **"Already me-too'd" state that persists across page loads** — not
  addressed. `reportedIds` today is session-only client state (reset on
  reload); me-too follows the same convention. A user who reloads and
  taps again just doesn't increment the count a second time (unique
  constraint), no error shown.

## Data model

New table, mirroring `reports`:

```sql
create table me_toos (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (issue_id, user_id)
);

alter table issues add column me_too_count integer not null default 0;
```

`me_too_count` is a denormalized counter, incremented on each successful
insert. This avoids a `count(*)` aggregate/join on every list and map
render, and gives a ready-made column for the future sort-by-count
follow-up.

## API

New route: `POST /api/issues/[id]/me-too`, structured as a near-copy of
`src/app/api/issues/[id]/report/route.ts`:

1. Require a signed-in user (`401` if not) and a non-banned profile
   (`403` if banned) — same checks as `report`.
2. Confirm the issue exists (`404` if not).
3. Insert into `me_toos` via a new `insertMeToo(issueId, userId)` in
   `src/lib/meToos.ts`, using the same "swallow the unique-constraint
   conflict, return whether a row was actually inserted" idiom as
   `insertReport` in `src/lib/reports.ts`.
4. On a real insert (not a duplicate), increment `issues.me_too_count`
   by 1 via `src/lib/issues.ts`.
5. Return `{ meToo: true, count }`, where `count` is `issue.meTooCount + 1`
   on a real insert, or `issue.meTooCount` unchanged on a duplicate (using
   the `issue` already fetched in step 2 — no extra read-back needed) —
   the client needs this to update the displayed number without a full
   issue refetch.

No moderation logic applies here (no thresholds, no strikes) — this is
purely a counter, unlike `reports`.

## UI

- `Issue` type (`src/types/issue.ts`) gains `meTooCount: number`, mapped
  from `me_too_count` in `src/lib/issues.ts` (same pattern as the recent
  `resolvedAt` addition).
- `IssueMap.tsx`: add a "ME TOO {count}" button in the popup's action
  row, next to `Report`. Session-only optimistic disable via a new
  `meTooedIds` Set state, updated on a successful response — identical
  structure to the existing `reportedIds` handling. On click, call the
  new endpoint and update both `meTooedIds` and the locally-held count
  for that popup issue.
- `IssueListCard.tsx`: show the count next to (or below) the existing
  photo/video indicator row. Read-only here — no button — since the
  list card doesn't currently carry any other write actions (`Report`
  and `Mark resolved` both live only in the map popup); tapping the card
  opens the popup, where the button lives.

## Edge cases

- **Double-click before the response returns**: disable the button
  immediately on click (before awaiting the fetch), not just after the
  response, to prevent a double-submit from the same session.
- **Resolved issues**: no restriction — a resolved issue can still
  accumulate me-toos (e.g. someone finding it after the fact). No
  special-casing needed.
- **Issue not found / network error**: reuse the existing `actionError`
  state and message pattern already in `IssueMap.tsx` for `Report`.

## Testing

- No new pure-logic helper worth a Vitest unit test here (`insertMeToo`
  and the count increment are thin Supabase calls, same as `insertReport`
  today, which also has no unit test).
- Manual in-browser verification: confirm the button is hidden entirely
  when signed out (matching `Report`'s `{user && ...}` guard), then as a
  signed-in user confirm the count increments and the button disables
  for the session, and confirm a second tap after reload doesn't
  double-count.
- `npm run lint` and `npm run build` must pass, per project convention.
