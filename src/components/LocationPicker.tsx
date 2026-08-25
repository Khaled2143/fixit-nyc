"use client";

import { Map, Marker } from "react-map-gl/mapbox";
import { useColorScheme } from "@/lib/useColorScheme";
import "mapbox-gl/dist/mapbox-gl.css";

const NYC_CENTER = { latitude: 40.7128, longitude: -74.006, zoom: 11 };

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

  return (
    <div className="overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
      <Map
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        initialViewState={NYC_CENTER}
        style={{ width: "100%", height: "min(60vh, 500px)" }}
        mapStyle={
          colorScheme === "dark"
            ? "mapbox://styles/mapbox/dark-v11"
            : "mapbox://styles/mapbox/streets-v12"
        }
        onClick={(e) => onPick(e.lngLat.lat, e.lngLat.lng)}
      >
        {latitude !== null && longitude !== null && (
          <Marker
            latitude={latitude}
            longitude={longitude}
            draggable
            onDragEnd={(e) => onPick(e.lngLat.lat, e.lngLat.lng)}
          />
        )}
      </Map>
    </div>
  );
}
