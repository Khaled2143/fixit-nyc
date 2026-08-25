"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export function IssueReportModal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setMounted(true);
    } else {
      setVisible(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (open || !mounted) return;
    const timeout = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(timeout);
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[3px] transition-opacity duration-200 motion-reduce:transition-none dark:bg-black/60 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Report an issue"
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-paper shadow-2xl transition-transform duration-200 ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none dark:bg-slate sm:top-1/2 sm:left-1/2 sm:bottom-auto sm:w-[470px] sm:max-h-[85vh] sm:rounded-2xl ${
          visible
            ? "translate-y-0 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:scale-100"
            : "translate-y-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:scale-95"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-ink hover:bg-black/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
        {children}
      </div>
    </>
  );
}
