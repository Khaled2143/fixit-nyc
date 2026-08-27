import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidUsername } from "@/lib/username";
import { setUsername } from "@/lib/profiles";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims;

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json();
  const username = typeof body.username === "string" ? body.username.trim() : "";

  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: "Username must be 3-20 characters: letters, numbers, or underscores." },
      { status: 400 },
    );
  }

  const result = await setUsername(user.sub, username);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ username });
}
