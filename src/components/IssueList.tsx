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
