"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ISSUE_CATEGORIES, type IssueCategory } from "@/types/issue";
import { geocodeAddress } from "@/lib/geocoding";

export default function SubmitIssue() {
  const router = useRouter();
  const [category, setCategory] = useState<IssueCategory>(ISSUE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [videoLink, setVideoLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const location = await geocodeAddress(address);
    if (!location) {
      setError("Couldn't find that address. Try being more specific.");
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
        address,
        locationSource: "address",
        videoLink: videoLink || null,
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
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Report an issue</h1>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as IssueCategory)}
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
          >
            {ISSUE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          Description
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
          />
        </label>

        <label className="flex flex-col gap-1">
          Address
          <input
            required
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. 5th Ave & W 34th St, New York, NY"
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
          />
        </label>

        <label className="flex flex-col gap-1">
          Video link (optional)
          <input
            type="url"
            value={videoLink}
            onChange={(e) => setVideoLink(e.target.value)}
            placeholder="https://tiktok.com/..."
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
          />
        </label>

        {error && <p className="text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>
      </form>
    </main>
  );
}
