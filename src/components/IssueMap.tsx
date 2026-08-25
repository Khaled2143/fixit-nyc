"use client";

import { useState } from "react";
import { Map, Marker, Popup } from "react-map-gl/mapbox";
import type { Issue } from "@/types/issue";
import "mapbox-gl/dist/mapbox-gl.css";

const NYC_CENTER = { latitude: 40.7128, longitude: -74.006, zoom: 11 };

export function IssueMap({ issues }: { issues: Issue[] }) {
  const [selected, setSelected] = useState<Issue | null>(null);

  return (
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
  );
}
