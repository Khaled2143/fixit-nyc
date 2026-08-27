import { supabaseAdmin } from "./supabase/admin";

export async function insertReport(issueId: string, reporterId: string): Promise<{ inserted: boolean }> {
  const { error } = await supabaseAdmin
    .from("reports")
    .insert({ issue_id: issueId, reporter_id: reporterId });

  if (error) {
    if (error.code === "23505") {
      // Postgres unique_violation — this user already reported this issue.
      return { inserted: false };
    }
    throw error;
  }

  return { inserted: true };
}

export async function countReports(issueId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("reports")
    .select("*", { count: "exact", head: true })
    .eq("issue_id", issueId);

  if (error) throw error;
  return count ?? 0;
}
