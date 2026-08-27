"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import type { Issue } from "@/types/issue";
import { IssueList } from "@/components/IssueList";
import type { CategoryFilter } from "@/components/CategoryFilterChips";

// The top snap point must be exactly 1: vaul only lets an inner element handle
// a vertical touch gesture when the sheet's own translate offset is 0, which
// only happens at a snap point of 1. Anything less (e.g. 0.92) makes vaul drag
// the whole sheet instead of scrolling the card list.
const SNAP_POINTS = [0.15, 0.5, 1];

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
