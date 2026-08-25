"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ISSUE_CATEGORIES, LOCATION_SOURCES, type IssueCategory, type LocationSource } from "@/types/issue";
import { geocodeAddress } from "@/lib/geocoding";
import { isSupportedVideoLink } from "@/lib/linkParsing";
import { LocationPicker } from "@/components/LocationPicker";

const LOCATION_METHODS: { value: LocationSource; label: string }[] = [
  { value: "address", label: "Address" },
  { value: "manual_pin", label: "Drop a pin" },
  { value: "latlong", label: "Lat/Long" },
];

const fieldClass =
  "rounded border border-zinc-300 px-3 py-3 text-base dark:border-zinc-700 dark:bg-black";

export default function SubmitIssue() {
  const router = useRouter();
  const [category, setCategory] = useState<IssueCategory>(ISSUE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [locationSource, setLocationSource] = useState<LocationSource>(LOCATION_SOURCES[0]);
  const [address, setAddress] = useState("");
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");
  const [videoLink, setVideoLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (videoLink.trim() !== "" && !isSupportedVideoLink(videoLink.trim())) {
      setError("Video link must be a TikTok or Instagram URL.");
      return;
    }

    let location: { latitude: number; longitude: number } | null = null;
    let resolvedAddress: string | null = null;

    if (locationSource === "address") {
      setSubmitting(true);
      location = await geocodeAddress(address);
      if (!location) {
        setError("Couldn't find that address. Try being more specific.");
        setSubmitting(false);
        return;
      }
      resolvedAddress = address;
    } else if (locationSource === "manual_pin") {
      if (!pin) {
        setError("Tap the map to drop a pin at the issue's location.");
        return;
      }
      location = pin;
      setSubmitting(true);
    } else if (locationSource === "latlong") {
      const latitude = Number(latInput);
      const longitude = Number(lngInput);
      if (
        latInput.trim() === "" ||
        lngInput.trim() === "" ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        setError("Enter a valid latitude (-90 to 90) and longitude (-180 to 180).");
        return;
      }
      location = { latitude, longitude };
      setSubmitting(true);
    }

    if (!location) {
      setError("Location is required.");
      setSubmitting(false);
      return;
    }

    const response = await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        description,
        latitude: location.latitude,
        longitude: location.longitude,
        address: resolvedAddress,
        locationSource,
        videoLink: videoLink.trim() || null,
      }),
    });

    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }

    router.push("/");
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold">Report an issue</h1>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as IssueCategory)}
            className={fieldClass}
          >
            {ISSUE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          Description
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={fieldClass}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span>Location</span>
          <div className="flex gap-2">
            {LOCATION_METHODS.map((method) => (
              <button
                key={method.value}
                type="button"
                aria-pressed={locationSource === method.value}
                onClick={() => setLocationSource(method.value)}
                className={`flex-1 rounded border px-3 py-3 text-base ${
                  locationSource === method.value
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              >
                {method.label}
              </button>
            ))}
          </div>

          {locationSource === "address" && (
            <input
              required
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 5th Ave & W 34th St, New York, NY"
              className={fieldClass}
            />
          )}

          {locationSource === "manual_pin" && (
            <LocationPicker
              latitude={pin?.latitude ?? null}
              longitude={pin?.longitude ?? null}
              onPick={(latitude, longitude) => setPin({ latitude, longitude })}
            />
          )}

          {locationSource === "latlong" && (
            <div className="flex gap-2">
              <input
                required
                type="text"
                inputMode="decimal"
                value={latInput}
                onChange={(e) => setLatInput(e.target.value)}
                placeholder="Latitude"
                className={`${fieldClass} w-1/2`}
              />
              <input
                required
                type="text"
                inputMode="decimal"
                value={lngInput}
                onChange={(e) => setLngInput(e.target.value)}
                placeholder="Longitude"
                className={`${fieldClass} w-1/2`}
              />
            </div>
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          Video link (optional)
          <input
            type="url"
            value={videoLink}
            onChange={(e) => setVideoLink(e.target.value)}
            placeholder="https://tiktok.com/..."
            className={fieldClass}
          />
        </label>

        {error && <p className="text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-black px-4 py-3.5 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>
      </form>
    </main>
  );
}
