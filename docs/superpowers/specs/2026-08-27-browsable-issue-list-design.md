# Browsable Issue List and Filters — Design

## Context

Right now, loading the site drops visitors onto a full-screen map with no
way to browse issues other than clicking pins one at a time. There's no
way to see "what's near me" as a list, no way to filter by category, and
the on-map popup is the only detail view.

This is the first of three sub-projects toward a richer browsing
experience (see the inline decomposition agreed in chat): this one covers
the browsable list and category filters. "Me too" agree counts and a
stats header / hot-spots chart are separate follow-up sub-projects, each
getting their own spec later.

A reference mobile-app mockup (provided by the user) inspired the
direction, adapted for the web rather than copied — see Non-goals for
what's deliberately not being replicated.

## Goals

- Let visitors browse all issues (optionally filtered by category) as a
  scrollable list, not just by hunting for pins on the map.
- Sync the list and map: scrolling the list pans the map to keep the
  active issue's pin centered and visually highlighted.
- Selecting a pin or a list card re-anchors the list, sorting the rest by
  distance from that issue (no geolocation permission required).
- Keep the existing on-map popup as the single detail view (used by both
  a direct pin click and a list card tap), with video dropped from it.
- Remove visible scrollbars site-wide (scrolling still works, the
  scrollbar itself is just hidden).

## Non-goals

- **"Me too" / agree counts** — separate sub-project. Cards in this spec
  show no agree count at all (not even a placeholder).
- **Stats header / hot-spots chart** — separate sub-project.
- **Geolocation-based "near me" sorting** — explicitly rejected in favor
  of the distance-from-selected-pin anchor approach, which needs no
  location permission.
- **Popup auto-opening on scroll** — explicitly rejected; the popup only
  opens on an explicit tap (of a pin or a card), to avoid it flickering
  open/closed as someone scrolls quickly.
- **Multi-select filters** — single-select only, matching the reference
  mockup.
- **URL/shareable state for the active filter or selected issue** — not
  addressed here; can be a later addition if wanted.
- **Changing how issues are submitted** (e.g. replacing the manual-pin
  location method with "use my current location") — explicitly kept as
  its own separate future discussion, unrelated to this browsing feature.

## Layout

Split view, chosen over an overlay panel or tab-switcher because it's the
only structure that supports the scroll-to-highlight sync:

- **Desktop** (`lg:` breakpoint and up): fixed sidebar to one side of the
  map, always visible.
- **Mobile** (below `lg:`): a bottom sheet using
  [`vaul`](https://github.com/emilkowalski/vaul) (new dependency) with
  snap points for peek / half / full height, dragged open/closed like a
  native sheet. Map is visible above/behind it at all snap points except
  full.

Both contain the same two pieces stacked vertically: the filter chip row,
then the scrollable card list.

## Components

- **`IssueListPanel`** (new) — the split-view container itself. Renders
  as a sidebar `<aside>` on desktop and swaps to a `vaul` `Drawer` below
  `lg:`. Holds `CategoryFilterChips` and the scrollable list of
  `IssueListCard`s.
- **`IssueListCard`** (new) — one issue: a category icon badge (reusing
  `CATEGORY_STYLES` from `categoryStyles.ts` — same colors already used
  for map pins), the description truncated to two lines, and a meta line
  (`category · Open Xd / Resolved · borough`). The whole card is a tap
  target. Renders with a highlighted border/ring when it's the active
  issue.
- **`CategoryFilterChips`** (new) — single-select pill row: "All" plus
  one chip per `ISSUE_CATEGORY`. Selecting a category filters both the
  list and the map's visible pins.
- **`IssueMap`** (existing, modified) — the popup drops its video-link
  section. Gains an `activeIssueId` prop so it can pan to and highlight
  the correct pin (larger radius + accent ring), and calls back up on
  pin click so the list can sync to it too.
- **`HomeView`** (existing, modified) — lifts `activeIssueId` and
  `activeCategory` state so both `IssueMap` and `IssueListPanel` read and
  write the same source of truth.

## Data flow and sync logic

No new API routes or schema changes. Issues are already fetched
server-side and passed down as props; everything here operates on that
same array, client-side:

- **Filtering**: `issues.filter(i => activeCategory === "All" || i.category === activeCategory)`.
- **Default order**: newest first (`createdAt` descending), stable.
- **Anchored order**: once `activeIssueId` is set (via pin click or card
  tap), the matching issue moves to the top and the rest are sorted by
  distance from it, using a new `src/lib/distance.ts` Haversine helper
  (unit-tested, same convention as the project's other `lib` utilities).
- **Scroll → map sync**: an `IntersectionObserver` in `IssueListPanel`
  tracks which card is nearest the top of the scrollable area and updates
  `activeIssueId` (debounced) as the user scrolls. `IssueMap` reacts to
  that prop change by panning to and highlighting the corresponding pin —
  it does **not** open the popup.
- **Pin/card tap → popup**: an explicit tap (pin or card) sets
  `activeIssueId` *and* opens the popup for that issue.
- **Feedback-loop guard**: setting `activeIssueId` from a pin/card tap
  triggers a programmatic scroll of the list to bring that card into
  view. That programmatic scroll must not itself re-fire the
  `IntersectionObserver` handler and stomp on the same `activeIssueId` —
  guarded with a short-lived "programmatic scroll in progress" flag.

## Scrollbar removal

Global CSS addition in `globals.css`: hide the scrollbar (`::-webkit-scrollbar { display: none }` for WebKit/Chromium, `scrollbar-width: none` for Firefox) applied broadly (`html`, and any internally scrollable containers like the list panel). Scrolling itself is unaffected — only the visible scrollbar track/thumb is hidden.

## Edge cases

- **Empty filtered list**: show a plain "No issues found" message in the
  list panel instead of an empty scroll area.
- **Very long descriptions**: CSS line-clamp to 2 lines in the card;
  full text still shows in the popup.
- **Re-tapping the already-active pin/card**: no-op on the sort/highlight
  (already active); still (re)opens the popup if it was closed.

## Testing

- `src/lib/distance.ts` gets real Vitest unit tests (known coordinate
  pairs, verifying distance ordering), matching how `linkParsing.ts`,
  `username.ts`, etc. are tested in this repo.
- The scroll-sync, pan/highlight, and drag-gesture behavior are not
  practically unit-testable in this project (no component/integration
  test setup exists — see CLAUDE.md, Vitest only). These get manual
  in-browser verification instead, consistent with how prior UI work in
  this project has been checked.
- `npm run lint` and `npm run build` must pass, per project convention.
