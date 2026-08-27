"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Issue } from "@/types/issue";
import { IssueMap } from "@/components/IssueMap";
import { IssueReportModal } from "@/components/IssueReportModal";
import { SubmitIssueForm } from "@/components/SubmitIssueForm";
import { AuthStatus } from "@/components/AuthStatus";
import { SignInForm } from "@/components/SignInForm";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

export function HomeView({ issues }: { issues: Issue[] }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const { user } = useSupabaseUser();

  return (
    <>
      <AuthStatus user={user} onSignInClick={() => setSignInOpen(true)} />
      <IssueMap
        issues={issues}
        user={user}
        onReportIssue={() => setModalOpen(true)}
        onIssueChanged={() => router.refresh()}
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
