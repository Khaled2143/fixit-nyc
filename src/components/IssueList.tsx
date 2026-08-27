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

  // A tap re-anchors the distance sort, moving the tapped card to the top of the
  // list. Scroll up to reveal that reordering — the effect below can't, since it
  // bails out when the tapped card was already the active one.
  function handleCardTap(id: string) {
    onCardTap(id);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

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

    // `observe()` queues an initial notification for every newly-observed
    // target, so the first batch arrives without the user having scrolled at
    // all. Swallow that batch: reporting it as active would pan the map off
    // NYC on load (and again whenever this effect re-observes).
    let hasSeenInitialBatch = false;

    // A batch only contains the cards whose intersection state *changed*, so we
    // keep a running record of everything currently in the band — otherwise a
    // card entering below an already-visible one would be reported as topmost.
    const intersecting = new Map<string, boolean>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const entryId = entry.target.getAttribute("data-issue-id");
          if (entryId) intersecting.set(entryId, entry.isIntersecting);
        }

        if (!hasSeenInitialBatch) {
          hasSeenInitialBatch = true;
          return;
        }

        if (isProgrammaticScroll.current) return;

        let id: string | null = null;
        let topmost = Infinity;
        for (const [candidateId, isIntersecting] of intersecting) {
          if (!isIntersecting) continue;
          const card = cardRefs.current.get(candidateId);
          if (!card) continue;
          const top = card.getBoundingClientRect().top;
          if (top < topmost) {
            topmost = top;
            id = candidateId;
          }
        }
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
              onClick={() => handleCardTap(issue.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
