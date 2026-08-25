"use client";

import { useState } from "react";
import Link from "next/link";
import { Map, Marker, Popup } from "react-map-gl/mapbox";
import type { Issue } from "@/types/issue";
import { useColorScheme } from "@/lib/useColorScheme";
import "mapbox-gl/dist/mapbox-gl.css";

const NYC_CENTER = { latitude: 40.7128, longitude: -74.006, zoom: 11 };

export function IssueMap({ issues }: { issues: Issue[] }) {
  const [selected, setSelected] = useState<Issue | null>(null);
  const colorScheme = useColorScheme();

  return (
    <div className="relative h-screen w-full">
      <Link
        href="/submit"
        className="absolute top-4 right-4 z-10 rounded bg-black px-4 py-3 text-base font-medium text-white shadow dark:bg-white dark:text-black"
      >
        Report an issue
      </Link>
      <Map
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        initialViewState={NYC_CENTER}
        style={{ width: "100%", height: "100vh" }}
        mapStyle={
          colorScheme === "dark"
            ? "mapbox://styles/mapbox/dark-v11"
            : "mapbox://styles/mapbox/streets-v12"
        }
        onClick={() => setSelected(null)}
      >
        {issues.map((issue) => (
          <Marker
            key={issue.id}
            latitude={issue.latitude}
            longitude={issue.longitude}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setSelected(issue);
            }}
          />
        ))}

        {selected && (
          <Popup
            latitude={selected.latitude}
            longitude={selected.longitude}
            onClose={() => setSelected(null)}
            closeOnClick={false}
            anchor="bottom"
            maxWidth="320px"
          >
            <p className="text-lg font-semibold">{selected.category}</p>
            <p className="text-base text-zinc-600">{selected.description}</p>
            {selected.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not worth next/image config for a popup thumbnail
              <img
                src={selected.photoUrl}
                alt="Photo of the issue"
                className="mt-2 max-h-64 w-full rounded object-cover"
              />
            )}
          </Popup>
        )}
      </Map>
    </div>
  );
}
