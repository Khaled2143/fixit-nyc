@AGENTS.md

## Project: fixit-nyc

A public accountability board for NYC constituent issues. Residents already
post video complaints on TikTok/Instagram hoping city officials see them -
this app aggregates that scattered activity into one place.

Two ways an issue enters the system:
1. Native submission - user creates a structured issue directly on the site
   (optionally attaching video).
2. Linked submission - user pastes a TikTok/IG link; we store it as a
   reference (we do NOT re-host or download the video).

Every issue has: a category, a location (pinned via address/lat-long
geocoding), a status, and optionally a video or linked post. Issues are
shown on a public map.

### Status model (keep this simple - do not over-build)
- Only two states exist right now: `submitted` and `resolved`.
- There is currently NO admin/official-facing surface for manually managing
  issues. Do not scaffold admin auth, claim flows, or a "seen" state unless
  explicitly asked.
- Future vision (not implemented yet): the original poster follows up with
  an update video, and an AI layer infers resolution from that video to
  auto-flip status. Don't build this now - just don't design the schema in
  a way that would block it later (e.g. keep room for a `resolvedVia` or
  similar field down the line).

## Commands
- `npm run dev` - start local dev server
- `npm run lint` - run ESLint; run this after any change and fix errors before considering a task done
- `npm run build` - production build check

Testing: not yet set up. When we add tests, use Vitest (project convention - do not introduce Jest).

## Architecture

- `src/app/` - routes (App Router). API routes live in `src/app/api/`.
- `src/components/` - reusable UI components.
- `src/lib/` - non-UI logic: Supabase client setup, geocoding calls,
  TikTok/IG link parsing.
- `src/types/` - shared TypeScript types (e.g. the Issue type).

## Data & services

- Database: Supabase (Postgres), free tier. Stores issues (category,
  location, status, video/link references).
- Video storage (native submissions): Supabase Storage.
- Auth (future - not needed yet): Supabase Auth, if/when an
  admin-facing surface is built. Do not add auth now.
- Geocoding: not yet chosen - Mapbox Geocoding API is the plan
  (see earlier decision), not yet installed.
- Do not add Prisma or another ORM - use the Supabase client
  (`@supabase/supabase-js`) directly unless we explicitly decide
  otherwise.