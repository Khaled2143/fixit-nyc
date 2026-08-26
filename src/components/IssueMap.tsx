"use client";

import { useEffect, useState } from "react";
import { Map, Marker, Popup } from "react-map-gl/mapbox";
import { X } from "lucide-react";
import type { Issue } from "@/types/issue";
import { CATEGORY_STYLES, categoryColor } from "@/lib/categoryStyles";
import { useColorScheme } from "@/lib/useColorScheme";
import "mapbox-gl/dist/mapbox-gl.css";

const NYC_CENTER = { latitude: 40.7128, longitude: -74.006, zoom: 11 };
const NYC_BOUNDS: [[number, number], [number, number]] = [
  [-74.259, 40.477],
  [-73.7, 40.918],
];

export function IssueMap({
  issues,
  onReportIssue,
}: {
  issues: Issue[];
  onReportIssue: () => void;
}) {
  const [selected, setSelected] = useState<Issue | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (!lightboxPhoto) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxPhoto(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxPhoto]);

  return (
    <div className="relative h-screen w-full bg-paper dark:bg-slate">
      <button
        type="button"
        onClick={onReportIssue}
        className="absolute top-4 right-4 z-10 rounded-full bg-signal px-5 py-3 text-base font-semibold text-white shadow-lg"
      >
        + Report an issue
      </button>

      {colorScheme && (
        <Map
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
          onClick={() => setSelected(null)}
        >
          {issues.map((issue) => {
            const Icon = CATEGORY_STYLES[issue.category].icon;
            const color = categoryColor(issue.category, colorScheme);

            return (
              <Marker
                key={issue.id}
                latitude={issue.latitude}
                longitude={issue.longitude}
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setSelected(issue);
                }}
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white shadow-md dark:border-slate"
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

          {selected && (
            <Popup
              latitude={selected.latitude}
              longitude={selected.longitude}
              onClose={() => setSelected(null)}
              closeOnClick={false}
              anchor="bottom"
              maxWidth="380px"
            >
              <div>
                <p className="font-mono text-xs tracking-wide text-zinc-500 uppercase">
                  {selected.category}
                </p>
                <p className="text-lg font-semibold text-ink">{selected.description}</p>
                {selected.address && (
                  <p className="mt-1 font-mono text-xs text-zinc-500">{selected.address}</p>
                )}
                {selected.photoUrl && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxPhoto(selected.photoUrl);
                    }}
                    className="mt-2 block w-full cursor-zoom-in"
                    aria-label="View full-size photo"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not worth next/image config for a popup thumbnail */}
                    <img
                      src={selected.photoUrl}
                      alt="Photo of the issue"
                      className="max-h-56 w-full rounded object-contain"
                    />
                  </button>
                )}
                {selected.videoLink && (
                  <a
                    href={selected.videoLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm font-medium text-civic underline"
                  >
                    Watch the video
                  </a>
                )}
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
