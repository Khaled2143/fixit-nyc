import { NextResponse } from "next/server";
import { createIssue } from "@/lib/issues";
import { isSupportedVideoLink } from "@/lib/linkParsing";
import { ISSUE_CATEGORIES, LOCATION_SOURCES } from "@/types/issue";

export async function POST(request: Request) {
  const body = await request.json();
  const { category, description, latitude, longitude, address, locationSource, videoLink, photoUrl } = body;

  if (!ISSUE_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  if (typeof description !== "string" || description.trim().length === 0) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return NextResponse.json({ error: "Valid latitude and longitude are required" }, { status: 400 });
  }

  if (!LOCATION_SOURCES.includes(locationSource)) {
    return NextResponse.json({ error: "Invalid locationSource" }, { status: 400 });
  }

  if (address !== undefined && address !== null && typeof address !== "string") {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  if (videoLink !== undefined && videoLink !== null) {
    if (typeof videoLink !== "string" || !isSupportedVideoLink(videoLink)) {
      return NextResponse.json(
        { error: "Video link must be a TikTok or Instagram URL" },
        { status: 400 },
      );
    }
  }

  if (photoUrl !== undefined && photoUrl !== null && typeof photoUrl !== "string") {
    return NextResponse.json({ error: "Invalid photoUrl" }, { status: 400 });
  }

  try {
    const issue = await createIssue({
      category,
      description: description.trim(),
      latitude,
      longitude,
      address: address ?? null,
      locationSource,
      videoLink: videoLink ?? null,
      photoUrl: photoUrl ?? null,
    });

    return NextResponse.json(issue, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create issue" }, { status: 500 });
  }
}
