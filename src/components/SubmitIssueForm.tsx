"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { ISSUE_CATEGORIES, LOCATION_SOURCES, type IssueCategory, type LocationSource } from "@/types/issue";
import { geocodeAddress } from "@/lib/geocoding";
import { isSupportedVideoLink } from "@/lib/linkParsing";
import { uploadPhoto } from "@/lib/storage";
import { CATEGORY_STYLES } from "@/lib/categoryStyles";
import { LocationPicker } from "@/components/LocationPicker";
import { useProfile } from "@/lib/useProfile";
import { SignInForm } from "@/components/SignInForm";
import { UsernameOnboarding } from "@/components/UsernameOnboarding";

const LOCATION_METHODS: { value: LocationSource; label: string }[] = [
  { value: "address", label: "Address" },
  { value: "manual_pin", label: "Drop a pin" },
  { value: "latlong", label: "Lat/Long" },
];

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

const fieldClass =
  "rounded border border-rule px-3 py-3 text-base text-ink dark:border-zinc-700 dark:bg-black dark:text-white";

export function SubmitIssueForm({
  user,
  onSuccess,
}: {
  user: User | null;
  onSuccess: () => void;
}) {
  const { profile, loading: profileLoading, refresh: refreshProfile } = useProfile(user);
  const [category, setCategory] = useState<IssueCategory>(ISSUE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [locationSource, setLocationSource] = useState<LocationSource>(LOCATION_SOURCES[0]);
  const [address, setAddress] = useState("");
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");
  const [videoLink, setVideoLink] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setPhoto(null);
      return;
    }

    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setError("Photo must be a JPEG, PNG, WebP, or HEIC image.");
      e.target.value = "";
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setError("Photo must be under 10MB.");
      e.target.value = "";
      return;
    }

    setError(null);
    setPhoto(file);
  }

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

    let photoUrl: string | null = null;
    if (photo) {
      try {
        photoUrl = await uploadPhoto(photo);
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "Failed to upload photo. Try again.",
        );
        setSubmitting(false);
        return;
      }
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
        photoUrl,
      }),
    });

    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }

    onSuccess();
  }

  if (!user) {
    return (
      <div className="px-6 py-6 sm:px-7 sm:py-7">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink dark:text-white">
          Sign in to post
        </h1>
        <div className="mt-6">
          <SignInForm />
        </div>
      </div>
    );
  }

  if (profileLoading) {
    return <div className="px-6 py-6 sm:px-7 sm:py-7">Loading...</div>;
  }

  if (profile?.bannedAt) {
    return (
      <div className="px-6 py-6 sm:px-7 sm:py-7">
        <p className="text-sm text-ink dark:text-white">
          Your account has been suspended for repeated community guideline violations.
        </p>
      </div>
    );
  }

  if (!profile?.username) {
    return (
      <div className="px-6 py-6 sm:px-7 sm:py-7">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink dark:text-white">
          Pick a username
        </h1>
        <div className="mt-6">
          <UsernameOnboarding onDone={refreshProfile} />
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 sm:px-7 sm:py-7">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink dark:text-white">
        Report an issue
      </h1>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-ink dark:text-white">What is it?</span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {ISSUE_CATEGORIES.map((c) => {
              const Icon = CATEGORY_STYLES[c].icon;
              const isSelected = category === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setCategory(c)}
                  className={`flex min-h-[66px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center text-xs font-medium ${
                    isSelected
                      ? "border-civic bg-civic/10 text-civic"
                      : "border-rule text-ink dark:border-zinc-700 dark:text-white"
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.9} />
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink dark:text-white">
            What&apos;s going on?
          </span>
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="Be specific — neighbors read this"
            className={fieldClass}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-ink dark:text-white">Where is it?</span>
          <div className="flex gap-2">
            {LOCATION_METHODS.map((method) => (
              <button
                key={method.value}
                type="button"
                aria-pressed={locationSource === method.value}
                onClick={() => setLocationSource(method.value)}
                className={`flex-1 rounded border px-3 py-3 text-base ${
                  locationSource === method.value
                    ? "border-civic bg-civic text-white"
                    : "border-rule text-ink dark:border-zinc-700 dark:text-white"
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

        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-rule p-3 dark:border-zinc-700">
          <span className="font-mono text-xs tracking-wide text-zinc-500 uppercase">
            Add proof (optional)
          </span>

          <label className="flex flex-col gap-1.5">
            Photo
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className={fieldClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            TikTok / IG link
            <input
              type="url"
              value={videoLink}
              onChange={(e) => setVideoLink(e.target.value)}
              placeholder="https://tiktok.com/..."
              className={fieldClass}
            />
          </label>
        </div>

        {error && <p className="text-sm text-signal">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-signal px-4 py-3.5 text-base font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Posting..." : "Post to the board"}
        </button>

        <p className="text-xs text-zinc-500">
          Goes up right away. Skip names, plates, or anything you wouldn&apos;t put on a bulletin
          board.
        </p>
      </form>
    </div>
  );
}
