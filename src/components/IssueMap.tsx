"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Map, Marker, Popup, type MapRef } from "react-map-gl/mapbox";
import { Check, Clock, X } from "lucide-react";
import type { Issue } from "@/types/issue";
import { CATEGORY_STYLES, categoryColor } from "@/lib/categoryStyles";
import { useColorScheme } from "@/lib/useColorScheme";
import { daysBetween } from "@/lib/dates";
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
  const [meTooedIds, setMeTooedIds] = useState<Set<string>>(new Set());
  const [meTooCounts, setMeTooCounts] = useState<Record<string, number>>({});

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

  async function handleMeToo(issueId: string) {
    setActionError(null);
    setMeTooedIds((prev) => new Set(prev).add(issueId));

    function rollback() {
      setMeTooedIds((prev) => {
        const next = new Set(prev);
        next.delete(issueId);
        return next;
      });
    }

    try {
      const response = await fetch(`/api/issues/${issueId}/me-too`, { method: "POST" });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setActionError(body.error ?? "Couldn't register your me too.");
        rollback();
        return;
      }

      const body: { count: number } = await response.json();
      setMeTooCounts((prev) => ({ ...prev, [issueId]: body.count }));
      onIssueChanged();
    } catch {
      setActionError("Couldn't register your me too.");
      rollback();
    }
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
                {popupIssue.status === "resolved" && popupIssue.resolvedAt ? (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-civic">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Resolved in {daysBetween(popupIssue.createdAt, popupIssue.resolvedAt)}d
                  </p>
                ) : (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-zinc-500">
                    <Clock className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Open {daysBetween(popupIssue.createdAt, new Date().toISOString())}d
                  </p>
                )}
                <p className="mt-1 text-lg font-semibold text-ink">{popupIssue.description}</p>
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
                {popupIssue.videoLink && (
                  <a
                    href={popupIssue.videoLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm font-medium text-civic underline"
                  >
                    Watch the video
                  </a>
                )}

                {actionError && <p className="mt-2 text-sm text-signal">{actionError}</p>}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono text-zinc-500">
                    {meTooCounts[popupIssue.id] ?? popupIssue.meTooCount} me too
                  </span>
                  {user && !meTooedIds.has(popupIssue.id) && (
                    <button
                      type="button"
                      onClick={() => handleMeToo(popupIssue.id)}
                      className="rounded-full bg-civic px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Me too
                    </button>
                  )}
                  {meTooedIds.has(popupIssue.id) && (
                    <span className="text-xs font-mono text-zinc-500">Counted</span>
                  )}
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
