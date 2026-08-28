import { supabaseAdmin } from "./supabase/admin";

export async function insertMeToo(issueId: string, userId: string): Promise<{ inserted: boolean }> {
  const { error } = await supabaseAdmin
    .from("me_toos")
    .insert({ issue_id: issueId, user_id: userId });

  if (error) {
    if (error.code === "23505") {
      // Postgres unique_violation — this user already me-too'd this issue.
      return { inserted: false };
    }
    throw error;
  }

  return { inserted: true };
}
