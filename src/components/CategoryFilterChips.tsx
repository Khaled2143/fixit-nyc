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
    <div className="flex flex-wrap gap-2 px-3 py-2">
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
