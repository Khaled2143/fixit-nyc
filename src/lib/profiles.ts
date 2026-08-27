import { supabaseAdmin } from "./supabase/admin";

export interface Profile {
  id: string;
  username: string | null;
  strikes: number;
  bannedAt: string | null;
}

interface ProfileRow {
  id: string;
  username: string | null;
  strikes: number;
  banned_at: string | null;
}

function mapProfileRow(row: ProfileRow): Profile {
  return { id: row.id, username: row.username, strikes: row.strikes, bannedAt: row.banned_at };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapProfileRow(data as ProfileRow) : null;
}

export async function setUsername(
  userId: string,
  username: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();

  if (existing && existing.id !== userId) {
    return { ok: false, error: "That username is already taken." };
  }

  const { error } = await supabaseAdmin.from("profiles").update({ username }).eq("id", userId);
  if (error) return { ok: false, error: "Failed to set username." };
  return { ok: true };
}

export async function updateStrikes(userId: string, strikes: number, banned: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      strikes,
      ...(banned ? { banned_at: new Date().toISOString() } : {}),
    })
    .eq("id", userId);

  if (error) throw error;
}
