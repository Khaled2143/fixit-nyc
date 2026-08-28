import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIssueById, incrementMeTooCount } from "@/lib/issues";
import { insertMeToo } from "@/lib/meToos";
import { getProfile } from "@/lib/profiles";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims;

  if (!user) {
    return NextResponse.json({ error: "You must be signed in to me too an issue." }, { status: 401 });
  }

  const profile = await getProfile(user.sub);
  if (profile?.bannedAt) {
    return NextResponse.json(
      { error: "Your account has been suspended for repeated community guideline violations." },
      { status: 403 },
    );
  }

  const issue = await getIssueById(id);
  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const { inserted } = await insertMeToo(id, user.sub);
  if (!inserted) {
    return NextResponse.json({ meToo: true, count: issue.meTooCount });
  }

  await incrementMeTooCount(id, issue.meTooCount);

  return NextResponse.json({ meToo: true, count: issue.meTooCount + 1 });
}
