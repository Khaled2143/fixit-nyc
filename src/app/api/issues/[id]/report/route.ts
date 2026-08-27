import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIssueById, hideIssue } from "@/lib/issues";
import { insertReport, countReports } from "@/lib/reports";
import { getProfile, updateStrikes } from "@/lib/profiles";
import { evaluateReport } from "@/lib/reportModeration";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims;

  if (!user) {
    return NextResponse.json({ error: "You must be signed in to report an issue." }, { status: 401 });
  }

  const reporterProfile = await getProfile(user.sub);
  if (reporterProfile?.bannedAt) {
    return NextResponse.json(
      { error: "Your account has been suspended for repeated community guideline violations." },
      { status: 403 },
    );
  }

  const issue = await getIssueById(id);
  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const { inserted } = await insertReport(id, user.sub);
  if (!inserted) {
    return NextResponse.json({ reported: true });
  }

  const reportCount = await countReports(id);
  const posterProfile = issue.userId ? await getProfile(issue.userId) : null;
  const outcome = evaluateReport(reportCount, posterProfile?.strikes ?? 0);

  if (outcome.shouldHide) {
    await hideIssue(id);
    if (issue.userId) {
      await updateStrikes(issue.userId, outcome.strikesAfter, outcome.shouldBan);
    }
  }

  return NextResponse.json({ reported: true });
}
