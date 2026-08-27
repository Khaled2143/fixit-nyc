# Browsable Issue List and Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scrollable, filterable issue list synced to the map (scroll pans/highlights the active pin; selecting a pin or card re-sorts the list by distance from it), plus hide visible scrollbars site-wide.

**Architecture:** A new `IssueList` (filter chips + card list + scroll↔map sync via IntersectionObserver) is wrapped by a responsive `IssueListPanel` — a fixed sidebar on desktop, a draggable `vaul` bottom sheet on mobile. `HomeView` lifts the shared state (`activeIssueId`, `popupIssueId`, `activeCategory`) so the existing `IssueMap` and the new list panel stay in sync without a new API — everything operates client-side on the already-fetched `issues` array.

**Tech Stack:** Next.js App Router, React 19, Tailwind CSS v4, `react-map-gl`/Mapbox GL, `vaul` (new dependency) for the mobile bottom sheet, Vitest for the one new pure-logic utility.

**Spec:** `docs/superpowers/specs/2026-08-27-browsable-issue-list-design.md`

## Global Constraints

- No new API routes or database schema changes — all filtering/sorting operates client-side on the `issues` array already passed into `HomeView`.
- Category filter is single-select only ("All" or one category at a time).
- No geolocation — "nearby" sorting is distance-from-the-selected-issue, computed with a plain Haversine function, never the visitor's real location.
- The detail popup opens **only** on an explicit tap (pin or card) — scrolling the list must never auto-open it, only pan the map and highlight the pin.
- Popup drops its video-link section entirely (still shown: category, description, address, photo, report/resolve).
- Desktop/mobile split at Tailwind's `lg:` breakpoint (1024px), matching the project's existing responsive convention.
- Run `npm run lint` after every change and fix errors before considering a task done (per `CLAUDE.md`). Run `npm run build` before considering the final integration task done.
- Do not introduce Jest — this project's test convention is Vitest only.

---

## File Structure

**New:**
- `src/lib/distance.ts` + `src/lib/distance.test.ts` — Haversine distance + distance-sort, unit tested.
- `src/lib/useIsDesktop.ts` — `(min-width: 1024px)` media query hook, matching the existing `useColorScheme.ts` pattern (untested browser glue, same precedent).
- `src/components/CategoryFilterChips.tsx` — single-select category pill row.
- `src/components/IssueListCard.tsx` — one issue as a card (icon badge, description, meta line).
- `src/components/IssueList.tsx` — filter chips + scrollable card list + the scroll↔map sync logic (IntersectionObserver, programmatic-scroll guard).
- `src/components/IssueListPanel.tsx` — responsive shell: desktop `<aside>` vs. mobile `vaul` Drawer, both wrapping `IssueList`.

**Modified:**
- `src/app/globals.css` — hide scrollbars site-wide.
- `src/components/IssueMap.tsx` — drop the popup's video link; accept `activeIssueId`/`popupIssueId` and `onPinClick`/`onPopupClose` instead of owning `selected` state internally; pan to the active pin via a `MapRef`; highlight the active pin's marker.
- `src/components/HomeView.tsx` — own the lifted state, compute the filtered/ordered issue list, render `IssueListPanel` alongside the updated `IssueMap`.
- `package.json` / `package-lock.json` — add `vaul`.

---

### Task 1: Hide scrollbars site-wide

**Files:**
- Modify: `src/app/globals.css:36-41` (end of file)

**Interfaces:** None — pure CSS, no component interface.

- [ ] **Step 1: Add the scrollbar-hiding rule**

Append to the end of `src/app/globals.css`:

```css

* {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* older Edge/IE */
}

*::-webkit-scrollbar {
  display: none; /* Chrome, Safari, newer Edge */
}
```

- [ ] **Step 2: Verify with the dev server**

Run: `npm run dev`, open `http://localhost:3000` in a browser, and check any scrollable area (the page itself, later the issue list once it exists) has no visible scrollbar track while still scrolling normally with mouse wheel/trackpad/touch.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "style: hide visible scrollbars site-wide"
```

---

### Task 2: Distance utility

**Files:**
- Create: `src/lib/distance.ts`
- Test: `src/lib/distance.test.ts`

**Interfaces:**
- Produces: `haversineDistanceMeters(a: LatLong, b: LatLong): number`, `sortByDistanceFrom<T extends LatLong>(items: T[], anchor: LatLong): T[]` (returns a new array, does not mutate), `interface LatLong { latitude: number; longitude: number }` — all exported from `@/lib/distance`. `Issue` already satisfies `LatLong` structurally (it has `latitude`/`longitude` fields), so no adapter is needed when called with real issues later.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/distance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { haversineDistanceMeters, sortByDistanceFrom } from "./distance";

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical points", () => {
    const point = { latitude: 40.7128, longitude: -74.006 };
    expect(haversineDistanceMeters(point, point)).toBe(0);
  });

  it("returns roughly the known distance between Times Square and the Brooklyn Bridge (~6km)", () => {
    const timesSquare = { latitude: 40.758, longitude: -73.9855 };
    const brooklynBridge = { latitude: 40.7061, longitude: -73.9969 };
    const distance = haversineDistanceMeters(timesSquare, brooklynBridge);
    expect(distance).toBeGreaterThan(5800);
    expect(distance).toBeLessThan(6200);
  });
});

describe("sortByDistanceFrom", () => {
  const anchor = { latitude: 40.7128, longitude: -74.006 };
  const near = { id: "near", latitude: 40.713, longitude: -74.0062 };
  const far = { id: "far", latitude: 40.9, longitude: -73.8 };
  const middle = { id: "middle", latitude: 40.75, longitude: -73.99 };

  it("orders items from nearest to farthest from the anchor", () => {
    const result = sortByDistanceFrom([far, near, middle], anchor);
    expect(result.map((r) => r.id)).toEqual(["near", "middle", "far"]);
  });

  it("does not mutate the input array", () => {
    const input = [far, near, middle];
    const originalOrder = input.map((i) => i.id);
    sortByDistanceFrom(input, anchor);
    expect(input.map((i) => i.id)).toEqual(originalOrder);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/distance.test.ts`
Expected: FAIL — `Cannot find module './distance'`.

- [ ] **Step 3: Implement**

Create `src/lib/distance.ts`:

```ts
export interface LatLong {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6371000;

export function haversineDistanceMeters(a: LatLong, b: LatLong): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function sortByDistanceFrom<T extends LatLong>(items: T[], anchor: LatLong): T[] {
  return [...items].sort(
    (a, b) => haversineDistanceMeters(anchor, a) - haversineDistanceMeters(anchor, b),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/distance.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/distance.ts src/lib/distance.test.ts
git commit -m "feat: add Haversine distance utility for list sorting"
```

---

### Task 3: `useIsDesktop` hook

**Files:**
- Create: `src/lib/useIsDesktop.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `useIsDesktop(): boolean` from `@/lib/useIsDesktop` — `true` when the viewport matches `(min-width: 1024px)`, `false` otherwise (including on the server, to avoid a hydration flash of the desktop layout for mobile visitors).

- [ ] **Step 1: Implement**

Create `src/lib/useIsDesktop.ts`, mirroring the existing `useColorScheme.ts` pattern in this codebase:

```ts
"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";

function subscribe(callback: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Matches Tailwind's `lg:` breakpoint (1024px). Server snapshot defaults to
 * false (mobile layout) so hydration doesn't flash the desktop layout to
 * mobile visitors before the real match is known.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

No dedicated test — this is browser-API glue with no branching logic of its own, same precedent as the untested `useColorScheme.ts` already in this codebase.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/useIsDesktop.ts
git commit -m "feat: add useIsDesktop hook for the responsive list layout"
```

---

### Task 4: `CategoryFilterChips` component

**Files:**
- Create: `src/components/CategoryFilterChips.tsx`

**Interfaces:**
- Consumes: `ISSUE_CATEGORIES`, `IssueCategory` from `@/types/issue`.
- Produces: `export type CategoryFilter = IssueCategory | "All"` and `CategoryFilterChips({ active, onChange }: { active: CategoryFilter; onChange: (category: CategoryFilter) => void })` from `@/components/CategoryFilterChips` — later tasks (`IssueList`, `HomeView`) import `CategoryFilter` from here as the single source of truth for that type.

- [ ] **Step 1: Implement**

Create `src/components/CategoryFilterChips.tsx`:

```tsx
"use client";

import { ISSUE_CATEGORIES, type IssueCategory } from "@/types/issue";

export type CategoryFilter = IssueCategory | "All";

export function CategoryFilterChips({
  active,
  onChange,
}: {
  active: CategoryFilter;
  onChange: (category: CategoryFilter) => void;
}) {
  const options: CategoryFilter[] = ["All", ...ISSUE_CATEGORIES];

  return (
    <div className="flex gap-2 overflow-x-auto px-3 py-2">
      {options.map((option) => {
        const isActive = option === active;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={
              isActive
                ? "shrink-0 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white dark:bg-white dark:text-ink"
                : "shrink-0 rounded-full border border-rule px-3 py-1.5 text-xs font-medium whitespace-nowrap text-ink dark:border-zinc-700 dark:text-white"
            }
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Lint and build**

Run: `npm run lint && npm run build`
Expected: both succeed. (The build succeeding here just confirms this file type-checks in isolation — it isn't wired into any page yet, so there's nothing to click through until Task 8.)

- [ ] **Step 3: Commit**

```bash
git add src/components/CategoryFilterChips.tsx
git commit -m "feat: add category filter chips component"
```

---

### Task 5: `IssueListCard` component

**Files:**
- Create: `src/components/IssueListCard.tsx`

**Interfaces:**
- Consumes: `CATEGORY_STYLES`, `categoryColor` from `@/lib/categoryStyles`; `Issue` from `@/types/issue`.
- Produces: `IssueListCard({ issue, isActive, colorScheme, onClick }: { issue: Issue; isActive: boolean; colorScheme: "light" | "dark"; onClick: () => void })` from `@/components/IssueListCard`.

Note on the spec's "borough" meta field: the `Issue` type has no dedicated borough field, only `address: string | null` (see `src/types/issue.ts`). This uses `address` directly instead of inventing a borough-extraction step, which was never discussed as part of this spec.

- [ ] **Step 1: Implement**

Create `src/components/IssueListCard.tsx`:

```tsx
"use client";

import { CATEGORY_STYLES, categoryColor } from "@/lib/categoryStyles";
import type { Issue } from "@/types/issue";

function daysOpen(createdAt: string): number {
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
}

export function IssueListCard({
  issue,
  isActive,
  colorScheme,
  onClick,
}: {
  issue: Issue;
  isActive: boolean;
  colorScheme: "light" | "dark";
  onClick: () => void;
}) {
  const Icon = CATEGORY_STYLES[issue.category].icon;
  const color = categoryColor(issue.category, colorScheme);
  const statusText =
    issue.status === "resolved" ? "Resolved" : `Open ${daysOpen(issue.createdAt)}d`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        isActive
          ? "flex w-full gap-3 rounded-xl border-2 border-signal bg-white p-3 text-left dark:bg-black"
          : "flex w-full gap-3 rounded-xl border border-rule bg-white p-3 text-left dark:border-zinc-700 dark:bg-black"
      }
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: color }}
      >
        <Icon className="h-5 w-5 text-white" strokeWidth={1.9} />
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-semibold text-ink dark:text-white">
          {issue.description}
        </p>
        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
          {issue.category} · {statusText}
          {issue.address ? ` · ${issue.address}` : ""}
        </p>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Lint and build**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add src/components/IssueListCard.tsx
git commit -m "feat: add issue list card component"
```

---

### Task 6: `IssueList` — filter chips, card list, and scroll↔map sync

**Files:**
- Create: `src/components/IssueList.tsx`

**Interfaces:**
- Consumes: `CategoryFilterChips`, `CategoryFilter` from `@/components/CategoryFilterChips`; `IssueListCard` from `@/components/IssueListCard`; `Issue` from `@/types/issue`.
- Produces: `IssueList(props)` from `@/components/IssueList`, where `props` is:
  ```ts
  {
    issues: Issue[];
    activeIssueId: string | null;
    activeCategory: CategoryFilter;
    colorScheme: "light" | "dark";
    onActiveChange: (id: string) => void; // called from scroll — pans/highlights only
    onCardTap: (id: string) => void;      // called from an explicit tap — opens the popup too
    onCategoryChange: (category: CategoryFilter) => void;
  }
  ```
  `IssueListPanel` (Task 7) renders this inside either the desktop `<aside>` or the mobile `vaul` sheet, passing all of the above straight through.

This is the trickiest piece of the feature: it has to tell the difference between "the user scrolled" (pan + highlight only) and "a pin/card was tapped elsewhere, so scroll the list to match" (must not fight the observer). See the spec's Edge cases section for why the guard flag exists.

- [ ] **Step 1: Implement**

Create `src/components/IssueList.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { Issue } from "@/types/issue";
import { CategoryFilterChips, type CategoryFilter } from "@/components/CategoryFilterChips";
import { IssueListCard } from "@/components/IssueListCard";

export function IssueList({
  issues,
  activeIssueId,
  activeCategory,
  colorScheme,
  onActiveChange,
  onCardTap,
  onCategoryChange,
}: {
  issues: Issue[];
  activeIssueId: string | null;
  activeCategory: CategoryFilter;
  colorScheme: "light" | "dark";
  onActiveChange: (id: string) => void;
  onCardTap: (id: string) => void;
  onCategoryChange: (category: CategoryFilter) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastReportedId = useRef<string | null>(null);
  const isProgrammaticScroll = useRef(false);

  // External change (a pin or card tap) -> scroll the list to match.
  // Skipped when the change originated from our own scroll below, so we
  // don't fight the user mid-scroll.
  useEffect(() => {
    if (!activeIssueId || activeIssueId === lastReportedId.current) return;

    const card = cardRefs.current.get(activeIssueId);
    if (!card) return;

    isProgrammaticScroll.current = true;
    card.scrollIntoView({ behavior: "smooth", block: "start" });

    const timeout = setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 500);
    return () => clearTimeout(timeout);
  }, [activeIssueId]);

  // Scrolling -> track whichever card is nearest the top of the list and
  // report it as active (pan + highlight only, never opens the popup).
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScroll.current) return;

        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;

        const topmost = visible.reduce((closest, entry) =>
          entry.boundingClientRect.top < closest.boundingClientRect.top ? entry : closest,
        );
        const id = topmost.target.getAttribute("data-issue-id");
        if (!id) return;

        lastReportedId.current = id;
        onActiveChange(id);
      },
      { root, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );

    cardRefs.current.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [issues, onActiveChange]);

  return (
    <div className="flex h-full flex-col">
      <CategoryFilterChips active={activeCategory} onChange={onCategoryChange} />
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {issues.length === 0 && (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No issues found.
          </p>
        )}
        {issues.map((issue) => (
          <div
            key={issue.id}
            data-issue-id={issue.id}
            ref={(el) => {
              if (el) cardRefs.current.set(issue.id, el);
              else cardRefs.current.delete(issue.id);
            }}
          >
            <IssueListCard
              issue={issue}
              isActive={issue.id === activeIssueId}
              colorScheme={colorScheme}
              onClick={() => onCardTap(issue.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint and build**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add src/components/IssueList.tsx
git commit -m "feat: add IssueList with scroll-to-map sync logic"
```

---

### Task 7: `vaul` + `IssueListPanel` responsive shell

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npm install`)
- Create: `src/components/IssueListPanel.tsx`

**Interfaces:**
- Consumes: `IssueList` from `@/components/IssueList`; `CategoryFilter` from `@/components/CategoryFilterChips`; `Issue` from `@/types/issue`.
- Produces: `IssueListPanel(props)` from `@/components/IssueListPanel`, where `props` is everything `IssueList` takes, plus `isDesktop: boolean`. This is the component `HomeView` (Task 8) renders directly.

- [ ] **Step 1: Install vaul**

Run: `npm install vaul`

- [ ] **Step 2: Implement**

Create `src/components/IssueListPanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import type { Issue } from "@/types/issue";
import { IssueList } from "@/components/IssueList";
import type { CategoryFilter } from "@/components/CategoryFilterChips";

const SNAP_POINTS = [0.15, 0.5, 0.92];

export function IssueListPanel({
  isDesktop,
  ...listProps
}: {
  issues: Issue[];
  activeIssueId: string | null;
  activeCategory: CategoryFilter;
  colorScheme: "light" | "dark";
  onActiveChange: (id: string) => void;
  onCardTap: (id: string) => void;
  onCategoryChange: (category: CategoryFilter) => void;
  isDesktop: boolean;
}) {
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[1]);

  if (isDesktop) {
    return (
      <aside className="absolute top-0 right-0 z-10 h-screen w-96 border-l border-rule bg-paper dark:border-zinc-700 dark:bg-slate">
        <IssueList {...listProps} />
      </aside>
    );
  }

  return (
    <Drawer.Root
      open
      modal={false}
      dismissible={false}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <Drawer.Portal>
        <Drawer.Content className="fixed right-0 bottom-0 left-0 z-10 flex h-full max-h-screen flex-col rounded-t-2xl bg-paper outline-none dark:bg-slate">
          <div className="mx-auto mt-3 mb-1 h-1.5 w-9 shrink-0 rounded-full bg-rule dark:bg-zinc-700" />
          <div className="min-h-0 flex-1">
            <IssueList {...listProps} />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

`vaul`'s exact snap-point prop names have shifted across versions in the past — if `snapPoints`/`activeSnapPoint`/`setActiveSnapPoint` don't behave as written (drag doesn't snap, or the sheet won't sit at a partial height persistently), check `node_modules/vaul/README.md` for the installed version's API before changing anything else.

- [ ] **Step 3: Lint and build**

Run: `npm run lint && npm run build`
Expected: both succeed. (Still not wired into `HomeView` yet, so nothing to click through until Task 8 — this step only confirms it compiles.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/IssueListPanel.tsx
git commit -m "feat: add responsive IssueListPanel (desktop sidebar, mobile vaul sheet)"
```

---

### Task 8: Wire it into `IssueMap` and `HomeView`

This is the integration task — both files must change together (the props contract spans both), and this is where the whole feature becomes clickable for the first time.

**Files:**
- Modify: `src/components/IssueMap.tsx` (full rewrite — see below)
- Modify: `src/components/HomeView.tsx` (full rewrite — see below)

**Interfaces:**
- Consumes: everything produced by Tasks 2–7 (`sortByDistanceFrom` from `@/lib/distance`, `useIsDesktop` from `@/lib/useIsDesktop`, `IssueListPanel` from `@/components/IssueListPanel`, `CategoryFilter` from `@/components/CategoryFilterChips`), plus the existing `useColorScheme` from `@/lib/useColorScheme` and `useSupabaseUser` from `@/lib/useSupabaseUser`.
- Produces: `IssueMap`'s new prop signature (replacing its old one) — `{ issues, user, activeIssueId, popupIssueId, onPinClick, onPopupClose, onReportIssue, onIssueChanged }`. `HomeView` has no exported interface change (still just `{ issues }`), but is now the sole owner of `activeIssueId`/`popupIssueId`/`activeCategory` state for the whole page.

- [ ] **Step 1: Rewrite `IssueMap.tsx`**

Replace the entire contents of `src/components/IssueMap.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Map, Marker, Popup, type MapRef } from "react-map-gl/mapbox";
import { X } from "lucide-react";
import type { Issue } from "@/types/issue";
import { CATEGORY_STYLES, categoryColor } from "@/lib/categoryStyles";
import { useColorScheme } from "@/lib/useColorScheme";
import "mapbox-gl/dist/mapbox-gl.css";

const NYC_CENTER = { latitude: 40.7128, longitude: -74.006, zoom: 11 };
const NYC_BOUNDS: [[number, number], [number, number]] = [
  [-74.259, 40.477],
  [-73.7, 40.918],
];

export function IssueMap({
  issues,
  user,
  activeIssueId,
  popupIssueId,
  onPinClick,
  onPopupClose,
  onReportIssue,
  onIssueChanged,
}: {
  issues: Issue[];
  user: User | null;
  activeIssueId: string | null;
  popupIssueId: string | null;
  onPinClick: (id: string) => void;
  onPopupClose: () => void;
  onReportIssue: () => void;
  onIssueChanged: () => void;
}) {
  const mapRef = useRef<MapRef>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const colorScheme = useColorScheme();

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

  async function handleResolve(issueId: string) {
    setActionError(null);
    const response = await fetch(`/api/issues/${issueId}/resolve`, { method: "PATCH" });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setActionError(body.error ?? "Couldn't resolve this issue.");
      return;
    }

    onPopupClose();
    onIssueChanged();
  }

  useEffect(() => {
    if (!lightboxPhoto) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxPhoto(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxPhoto]);

  useEffect(() => {
    if (!activeIssueId) return;
    const issue = issues.find((i) => i.id === activeIssueId);
    if (!issue) return;
    mapRef.current?.flyTo({ center: [issue.longitude, issue.latitude], duration: 600 });
  }, [activeIssueId, issues]);

  return (
    <div className="relative h-screen w-full bg-paper dark:bg-slate">
      <button
        type="button"
        onClick={onReportIssue}
        className="absolute top-4 right-4 z-10 rounded-full bg-signal px-4 py-2.5 text-sm font-semibold text-white shadow-lg sm:px-5 sm:py-3 sm:text-base lg:right-[25rem]"
      >
        <span className="sm:hidden">+ Report</span>
        <span className="hidden sm:inline">+ Report an issue</span>
      </button>

      {colorScheme && (
        <Map
          ref={mapRef}
          mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          initialViewState={NYC_CENTER}
          maxBounds={NYC_BOUNDS}
          minZoom={10}
          maxZoom={18}
          style={{ width: "100%", height: "100vh" }}
          mapStyle={
            colorScheme === "dark"
              ? "mapbox://styles/mapbox/dark-v11"
              : "mapbox://styles/mapbox/light-v11"
          }
          onClick={onPopupClose}
        >
          {issues.map((issue) => {
            const Icon = CATEGORY_STYLES[issue.category].icon;
            const color = categoryColor(issue.category, colorScheme);
            const isActive = issue.id === activeIssueId;

            return (
              <Marker
                key={issue.id}
                latitude={issue.latitude}
                longitude={issue.longitude}
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  onPinClick(issue.id);
                }}
              >
                <div
                  className={
                    isActive
                      ? "flex h-10 w-10 items-center justify-center rounded-full border-2 border-white shadow-lg ring-4 ring-signal/50 dark:border-slate"
                      : "flex h-8 w-8 items-center justify-center rounded-full border-2 border-white shadow-md dark:border-slate"
                  }
                  style={{
                    backgroundColor: color,
                    opacity: issue.status === "resolved" ? 0.45 : 1,
                  }}
                >
                  <Icon className="h-4 w-4 text-white" strokeWidth={1.9} />
                </div>
              </Marker>
            );
          })}

          {popupIssue && (
            <Popup
              latitude={popupIssue.latitude}
              longitude={popupIssue.longitude}
              onClose={onPopupClose}
              closeOnClick={false}
              anchor="bottom"
              maxWidth="380px"
            >
              <div>
                <p className="font-mono text-xs tracking-wide text-zinc-500 uppercase">
                  {popupIssue.category}
                </p>
                <p className="text-lg font-semibold text-ink">{popupIssue.description}</p>
                {popupIssue.address && (
                  <p className="mt-1 font-mono text-xs text-zinc-500">{popupIssue.address}</p>
                )}
                {popupIssue.photoUrl && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxPhoto(popupIssue.photoUrl);
                    }}
                    className="mt-2 block w-full cursor-zoom-in"
                    aria-label="View full-size photo"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not worth next/image config for a popup thumbnail */}
                    <img
                      src={popupIssue.photoUrl}
                      alt="Photo of the issue"
                      className="max-h-56 w-full rounded object-contain"
                    />
                  </button>
                )}

                {actionError && <p className="mt-2 text-sm text-signal">{actionError}</p>}

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
                  {user && user.id === popupIssue.userId && popupIssue.status !== "resolved" && (
                    <button
                      type="button"
                      onClick={() => handleResolve(popupIssue.id)}
                      className="rounded-full bg-civic px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Mark resolved
                    </button>
                  )}
                </div>
              </div>
            </Popup>
          )}
        </Map>
      )}

      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxPhoto(null)}
            aria-label="Close"
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL */}
          <img
            src={lightboxPhoto}
            alt="Full-size photo of the issue"
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
```

Note the Report button gained `lg:right-[25rem]` — on desktop the new sidebar (`w-96` = 24rem) sits flush against the right edge, so the button shifts left by the sidebar's width plus the original 1rem gap to avoid sitting underneath it. On mobile, at the bottom sheet's fullest snap point (0.92) the sheet can visually reach near the button — that's an accepted minor rough edge, not something this task solves (the reference design showed the "report" action living inside the sheet itself at that point, which is a bigger structural change out of scope here).

- [ ] **Step 2: Rewrite `HomeView.tsx`**

Replace the entire contents of `src/components/HomeView.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Issue } from "@/types/issue";
import { IssueMap } from "@/components/IssueMap";
import { IssueListPanel } from "@/components/IssueListPanel";
import { IssueReportModal } from "@/components/IssueReportModal";
import { SubmitIssueForm } from "@/components/SubmitIssueForm";
import { AuthStatus } from "@/components/AuthStatus";
import { SignInForm } from "@/components/SignInForm";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import { useColorScheme } from "@/lib/useColorScheme";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { sortByDistanceFrom } from "@/lib/distance";
import type { CategoryFilter } from "@/components/CategoryFilterChips";

export function HomeView({ issues }: { issues: Issue[] }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [popupIssueId, setPopupIssueId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("All");
  const { user } = useSupabaseUser();
  const colorScheme = useColorScheme();
  const isDesktop = useIsDesktop();

  const filteredIssues = useMemo(
    () =>
      activeCategory === "All"
        ? issues
        : issues.filter((issue) => issue.category === activeCategory),
    [issues, activeCategory],
  );

  const orderedIssues = useMemo(() => {
    if (!activeIssueId) return filteredIssues;
    const anchor = filteredIssues.find((issue) => issue.id === activeIssueId);
    if (!anchor) return filteredIssues;
    return sortByDistanceFrom(filteredIssues, anchor);
  }, [filteredIssues, activeIssueId]);

  function handleIssueSelect(id: string) {
    setActiveIssueId(id);
    setPopupIssueId(id);
  }

  return (
    <>
      <AuthStatus user={user} onSignInClick={() => setSignInOpen(true)} />
      <IssueMap
        issues={filteredIssues}
        user={user}
        activeIssueId={activeIssueId}
        popupIssueId={popupIssueId}
        onPinClick={handleIssueSelect}
        onPopupClose={() => setPopupIssueId(null)}
        onReportIssue={() => setModalOpen(true)}
        onIssueChanged={() => router.refresh()}
      />
      <IssueListPanel
        issues={orderedIssues}
        activeIssueId={activeIssueId}
        activeCategory={activeCategory}
        colorScheme={colorScheme ?? "light"}
        onActiveChange={setActiveIssueId}
        onCardTap={handleIssueSelect}
        onCategoryChange={setActiveCategory}
        isDesktop={isDesktop}
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

Note `IssueMap` gets `filteredIssues` (category filter applies to map pins, order doesn't matter for pin placement) while `IssueListPanel` gets `orderedIssues` (the distance-anchored sort, which only matters for list order).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds with no type errors. This is the first point where a props mismatch between `IssueMap` and `HomeView` (or any earlier task) would surface — if it fails, check the failing file's props against the "Produces" section of the task that created it.

- [ ] **Step 5: Manual verification**

Run `npm run dev` and check, in a real browser, at both a desktop width (≥1024px) and a mobile-width window:

- Desktop: sidebar is visible on the right with filter chips + cards; the "+ Report an issue" button doesn't overlap it.
- Mobile: bottom sheet is draggable between its three snap points (peek/half/full); "+ Report" (short label) is visible except near the sheet's fullest snap point.
- Scrolling the list pans the map to keep the active card's pin centered, with the pin visibly larger/highlighted — but does **not** open the popup.
- Tapping a card, and separately tapping a pin directly, both open the popup (no video link in it) and re-sort the rest of the list by distance from that issue, with the tapped one first.
- Selecting a category chip filters both the map's pins and the list.
- Report/resolve buttons in the popup still work exactly as before (this logic wasn't changed, only how the popup is triggered/closed).
- No visible scrollbar anywhere the page or list scrolls.

- [ ] **Step 6: Commit**

```bash
git add src/components/IssueMap.tsx src/components/HomeView.tsx
git commit -m "feat: wire the issue list and map into a synced browsing view"
```

---

## Self-Review Notes

- **Spec coverage:** Split-view layout (Task 7), scroll→map pan/highlight (Task 6+8), tap-to-open-popup only (Task 6+8), distance-anchored re-sort (Task 2+8), single-select filter chips (Task 4), video dropped from popup (Task 8), scrollbar removal (Task 1) — all covered. Non-goals (agree counts, stats/chart, geolocation, popup-follows-scroll, multi-select, URL state, submission-flow changes) are correctly absent from every task.
- **Type consistency checked:** `CategoryFilter` is defined once in `CategoryFilterChips.tsx` and imported everywhere else that needs it (`IssueList`, `IssueListPanel`, `HomeView`) rather than redefined. `onActiveChange` vs `onCardTap` naming is consistent from `IssueList` through `IssueListPanel` to `HomeView` in every task that touches them.
