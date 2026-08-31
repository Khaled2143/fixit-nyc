"use client";

import { useEffect, useState } from "react";
import { Map, Marker } from "react-map-gl/mapbox";
import { useColorScheme } from "@/lib/useColorScheme";
import "mapbox-gl/dist/mapbox-gl.css";

const NYC_CENTER = { latitude: 40.7128, longitude: -74.006, zoom: 11 };
const NYC_BOUNDS: [[number, number], [number, number]] = [
  [-74.259, 40.477],
  [-73.7, 40.918],
];
const USER_LOCATION_ZOOM = 15;

type ViewState = { latitude: number; longitude: number; zoom: number };

export function LocationPicker({
  latitude,
  longitude,
  onPick,
}: {
  latitude: number | null;
  longitude: number | null;
  onPick: (latitude: number, longitude: number) => void;
}) {
  const colorScheme = useColorScheme();

  // Seeded from props so that re-opening this tab after already picking a
  // location doesn't re-trigger geolocation and jump the map around.
  const [initialView, setInitialView] = useState<ViewState | null>(() => {
    if (latitude !== null && longitude !== null) {
      return { latitude, longitude, zoom: USER_LOCATION_ZOOM };
    }
    if (typeof navigator !== "undefined" && !navigator.geolocation) {
      return NYC_CENTER;
    }
    return null;
  });

  useEffect(() => {
    if (initialView) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        onPick(lat, lng);
        setInitialView({ latitude: lat, longitude: lng, zoom: USER_LOCATION_ZOOM });
      },
      () => setInitialView(NYC_CENTER),
      { timeout: 5000 },
    );
    // Runs once per mount to seed the initial pin/view - onPick is excluded
    // since the parent passes a fresh closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="overflow-hidden rounded border border-rule bg-paper dark:bg-slate" style={{ minHeight: "min(60vh, 500px)" }}>
      {colorScheme && initialView ? (
        <Map
          mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          initialViewState={initialView}
          maxBounds={NYC_BOUNDS}
          minZoom={10}
          maxZoom={18}
          style={{ width: "100%", height: "min(60vh, 500px)" }}
          mapStyle={
            colorScheme === "dark"
              ? "mapbox://styles/mapbox/dark-v11"
              : "mapbox://styles/mapbox/light-v11"
          }
          onClick={(e) => onPick(e.lngLat.lat, e.lngLat.lng)}
        >
          {latitude !== null && longitude !== null && (
            <Marker
              latitude={latitude}
              longitude={longitude}
              draggable
              color="#c2410c"
              onDragEnd={(e) => onPick(e.lngLat.lat, e.lngLat.lng)}
            />
          )}
        </Map>
      ) : (
        <div
          className="flex items-center justify-center text-sm text-zinc-500"
          style={{ height: "min(60vh, 500px)" }}
        >
          Finding your location...
        </div>
      )}
    </div>
  );
}
