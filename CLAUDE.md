@AGENTS.md

## Project: fixit-nyc

A public accountability board for NYC constituent issues. Residents already
post video complaints on TikTok/Instagram hoping city officials see them -
this app aggregates that scattered activity into one place.

Two ways an issue enters the system:
1. Native submission - user creates a structured issue directly on the site
   (optionally linking to an existing video/post).
2. Linked submission - user pastes a TikTok/IG link; we store it as a
   reference (we do NOT re-host or download the video).

We never host or upload video ourselves - any video attached to an issue is
always an external link the viewer is redirected to.

Every issue has: a category, a required text description, a location, and
a status. Location can be captured as an address, a manually dropped map
pin, or raw lat/long - all resolve down to lat/long for pinning, and we
track which method was used (`locationSource`) for future debugging. A
photo and/or a video/post link are both optional bonus evidence. Issues
are shown on a public map.

### Status model (keep this simple - do not over-build)
- Only two states exist right now: `submitted` and `resolved`.
- There is currently NO admin/official-facing surface for manually managing
  issues. Do not scaffold admin auth, claim flows, or a "seen" state unless
  explicitly asked. The owner can self-resolve their own issue
  (`POST /api/issues/[id]/resolve`) - that is not an admin surface.
- Future vision (not implemented yet): the original poster follows up with
  an update video, and an AI layer infers resolution from that video to
  auto-flip status. Don't build this now - the `resolvedVia` field already
  exists on `issues` to leave room for this later.

## Commands
- `npm run dev` - start local dev server
- `npm run lint` - run ESLint; run this after any change and fix errors before considering a task done
- `npm run build` - production build check
- `npx vitest run` - run the test suite

Testing: set up with Vitest (project convention - do not introduce Jest).
Test files live next to the code they cover (`*.test.ts`).

## Architecture

- `src/app/` - routes (App Router). API routes live in `src/app/api/`.
- `src/components/` - reusable UI components.
- `src/lib/` - non-UI logic: Supabase client setup (`src/lib/supabase/`),
  geocoding calls, TikTok/IG link parsing, profiles/reports data layer,
  and moderation (profanity filter, photo SafeSearch, report thresholds).
- `src/types/` - shared TypeScript types (e.g. the Issue type).

## Data & services

- Database: Supabase (Postgres), free tier. Stores issues (category,
  location, status, video/link references), plus `profiles`, and
  `reports` (see Accounts & moderation below). Schema lives in
  `supabase/schema.sql` - append new changes there, don't rewrite history.
- Video: never stored/hosted by us - always an external link (TikTok/IG,
  etc.) that redirects out. No Supabase Storage usage for video.
- Auth: Supabase Auth, magic-link sign-in only (no password flow). Used to
  gate issue creation and reporting, and to attribute ownership - not an
  admin/official-facing surface. See Accounts & moderation below.
- Auth emails: sent via custom SMTP (Resend) configured in the Supabase
  dashboard (Authentication > Emails > SMTP Settings) - not in this repo.
  Supabase's built-in email sender is capped at ~2/hour on the free tier,
  which is unusable for real sign-ins; Resend's free tier (3,000/month) is
  wired in instead. The Magic Link template (Authentication > Emails >
  Templates) was edited to link to `/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/`
  instead of the default `{{ .ConfirmationURL }}`, because `/auth/confirm`
  expects `token_hash`/`type`, not a PKCE `code`. `nycfixit.com`'s SPF/DKIM/DMARC
  are correctly configured for Resend, but the domain is new (registered
  2026-08-26) - expect mail to land in spam for a while regardless of DNS
  correctness; this resolves with sending reputation over time, not config.
- Geocoding: Mapbox Geocoding API (`src/lib/geocoding.ts`), forward
  geocoding of a typed address to lat/long.
- Photo moderation: Google Cloud Vision SafeSearch
  (`src/lib/photoModeration.ts`), gates uploads before they reach Storage.
  Requires `GOOGLE_APPLICATION_CREDENTIALS_JSON` (a service-account JSON
  string) in the environment.
- Do not add Prisma or another ORM - use the Supabase client
  (`@supabase/supabase-js`) directly unless we explicitly decide
  otherwise.

## Accounts & moderation

- Sign-in is magic-link only, via Supabase Auth. A `profiles` row
  (username, strike count, ban timestamp) is auto-created per user via a
  DB trigger on `auth.users` insert.
- Creating an issue requires: a signed-in, non-banned account with a
  chosen username, and a description that passes the profanity filter
  (`src/lib/profanityFilter.ts`, the `bad-words` package).
- Any signed-in user can report another user's issue
  (`POST /api/issues/[id]/report`, one report per user per issue).
  Moderation thresholds live in `src/lib/reportModeration.ts`:
  `REPORT_THRESHOLD` reports auto-hides the issue and adds a strike to its
  owner; `STRIKE_THRESHOLD` strikes bans the account. This is fully
  automatic - there is still no human moderator/admin surface.
- All writes to `issues`, `profiles`, and `reports` go through
  server-side API routes using the Supabase service-role client
  (`src/lib/supabase/admin.ts`), which bypasses RLS. Do not add
  client-side inserts/updates to these tables.