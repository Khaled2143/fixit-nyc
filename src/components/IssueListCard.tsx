"use client";

import { Camera, Video } from "lucide-react";
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
        {(issue.photoUrl || issue.videoLink) && (
          <div className="mt-1 flex items-center gap-2 text-zinc-400 dark:text-zinc-500">
            {issue.photoUrl && <Camera className="h-3.5 w-3.5" strokeWidth={1.9} />}
            {issue.videoLink && <Video className="h-3.5 w-3.5" strokeWidth={1.9} />}
          </div>
        )}
        {issue.meTooCount > 0 && (
          <p className="mt-1 text-xs font-mono text-zinc-500 dark:text-zinc-400">{issue.meTooCount} me too</p>
        )}
      </div>
    </button>
  );
}
