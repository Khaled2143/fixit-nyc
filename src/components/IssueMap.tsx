"use client";

import { useState } from "react";
import Link from "next/link";
import { Map, Marker, Popup } from "react-map-gl/mapbox";
import type { Issue } from "@/types/issue";
import "mapbox-gl/dist/mapbox-gl.css";

const NYC_CENTER = { latitude: 40.7128, longitude: -74.006, zoom: 11 };

export function IssueMap({ issues }: { issues: Issue[] }) {
  const [selected, setSelected] = useState<Issue | null>(null);

  return (
    <div className="relative h-screen w-full">
      <Link
        href="/submit"
        className="absolute top-4 right-4 z-10 rounded bg-black px-4 py-2 text-white shadow dark:bg-white dark:text-black"
      >
        Report an issue
      </Link>
      <Map
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        initialViewState={NYC_CENTER}
        style={{ width: "100%", height: "100vh" }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
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
          >
            <p className="font-medium">{selected.category}</p>
            <p className="text-sm text-zinc-600">{selected.description}</p>
          </Popup>
        )}
      </Map>
    </div>
  );
}
