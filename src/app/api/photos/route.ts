import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isPhotoSafe } from "@/lib/photoModeration";
import { getProfile } from "@/lib/profiles";

const PHOTO_BUCKET = "issue-photos";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims;

  if (!user) {
    return NextResponse.json({ error: "You must be signed in to upload a photo." }, { status: 401 });
  }

  const profile = await getProfile(user.sub);

  if (profile?.bannedAt) {
    return NextResponse.json(
      { error: "Your account has been suspended for repeated community guideline violations." },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("photo");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No photo provided" }, { status: 400 });
  }

  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Photo must be a JPEG, PNG, WebP, or HEIC image." },
      { status: 400 },
    );
  }

  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "Photo must be under 5MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let safe: boolean;
  try {
    safe = await isPhotoSafe(buffer);
  } catch (moderationError) {
    console.error("POST /api/photos: SafeSearch check failed:", moderationError);
    return NextResponse.json({ error: "Couldn't process photo, try again." }, { status: 400 });
  }

  if (!safe) {
    return NextResponse.json({ error: "This photo isn't allowed. Try a different one." }, { status: 400 });
  }

  const extension = file.name.split(".").pop();
  const filename = `${randomUUID()}${extension ? `.${extension}` : ""}`;

  const { error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).upload(filename, buffer, {
    contentType: file.type,
  });

  if (error) {
    console.error("POST /api/photos: storage upload failed:", error);
    return NextResponse.json({ error: "Failed to upload photo." }, { status: 500 });
  }

  const { data } = supabaseAdmin.storage.from(PHOTO_BUCKET).getPublicUrl(filename);
  return NextResponse.json({ photoUrl: data.publicUrl });
}
