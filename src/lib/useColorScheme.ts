"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getSnapshot(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getServerSnapshot(): "light" | "dark" | null {
  return null;
}

/**
 * Returns null until the real client-side preference is known. Callers that
 * feed this into Mapbox's mapStyle prop must wait for a non-null value
 * before mounting the map - switching mapStyle right after an initial
 * mount can't be diffed (different sprite sheets) and races Mapbox's
 * full style rebuild, producing an AbortError.
 */
export function useColorScheme(): "light" | "dark" | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
