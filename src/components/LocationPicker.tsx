"use client";

import { Map, Marker } from "react-map-gl/mapbox";
import { useColorScheme } from "@/lib/useColorScheme";
import "mapbox-gl/dist/mapbox-gl.css";

const NYC_CENTER = { latitude: 40.7128, longitude: -74.006, zoom: 11 };
const NYC_BOUNDS: [[number, number], [number, number]] = [
  [-74.259, 40.477],
  [-73.7, 40.918],
];

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
    <div className="overflow-hidden rounded border border-rule">
      <Map
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        initialViewState={NYC_CENTER}
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
    </div>
  );
}
