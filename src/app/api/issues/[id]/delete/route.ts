import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIssueById, hideIssue } from "@/lib/issues";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims;

  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const issue = await getIssueById(id);
  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  if (issue.userId !== user.sub) {
    return NextResponse.json({ error: "You can't delete someone else's report." }, { status: 403 });
  }

  await hideIssue(id);
  return NextResponse.json({ status: "deleted" });
}
