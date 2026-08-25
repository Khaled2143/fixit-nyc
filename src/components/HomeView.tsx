"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Issue } from "@/types/issue";
import { IssueMap } from "@/components/IssueMap";
import { IssueReportModal } from "@/components/IssueReportModal";
import { SubmitIssueForm } from "@/components/SubmitIssueForm";

export function HomeView({ issues }: { issues: Issue[] }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <IssueMap issues={issues} onReportIssue={() => setModalOpen(true)} />
      <IssueReportModal open={modalOpen} onClose={() => setModalOpen(false)}>
        <SubmitIssueForm
          onSuccess={() => {
            setModalOpen(false);
            router.refresh();
          }}
        />
      </IssueReportModal>
    </>
  );
}
