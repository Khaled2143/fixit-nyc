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
  const [anchorIssueId, setAnchorIssueId] = useState<string | null>(null);
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

  // Anchored on its own id (only ever set by an explicit pin/card tap), never on
  // the scroll-driven active id — otherwise scrolling would re-sort the list
  // out from under the user's own scroll position. It is deliberately kept
  // separate from `popupIssueId` so closing the popup doesn't discard the
  // "browsing near this issue" ordering.
  const orderedIssues = useMemo(() => {
    if (!anchorIssueId) return filteredIssues;
    const anchor = filteredIssues.find((issue) => issue.id === anchorIssueId);
    if (!anchor) return filteredIssues;
    return sortByDistanceFrom(filteredIssues, anchor);
  }, [filteredIssues, anchorIssueId]);

  function handleIssueSelect(id: string) {
    setActiveIssueId(id);
    setPopupIssueId(id);
    setAnchorIssueId(id);
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
