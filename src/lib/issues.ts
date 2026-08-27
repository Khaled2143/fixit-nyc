// src/lib/issues.ts
import { createClient } from "./supabase/server";
import { supabaseAdmin } from "./supabase/admin";
import type { Issue, IssueCategory, IssueStatus, LocationSource } from "@/types/issue";

interface IssueRow {
  id: string;
  category: IssueCategory;
  description: string;
  latitude: number;
  longitude: number;
  address: string | null;
  location_source: LocationSource;
  status: IssueStatus;
  photo_url: string | null;
  video_link: string | null;
  resolved_via: string | null;
  created_at: string;
  user_id: string | null;
  hidden: boolean;
}

function mapRow(row: IssueRow): Issue {
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    locationSource: row.location_source,
    status: row.status,
    photoUrl: row.photo_url,
    videoLink: row.video_link,
    resolvedVia: row.resolved_via,
    createdAt: row.created_at,
    userId: row.user_id,
    hidden: row.hidden,
  };
}

export async function getIssues(): Promise<Issue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .eq("hidden", false)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data as IssueRow[]).map(mapRow);
}

export async function getIssueById(id: string): Promise<Issue | null> {
  const { data, error } = await supabaseAdmin
    .from("issues")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as IssueRow) : null;
}

export interface CreateIssueInput {
  category: IssueCategory;
  description: string;
  latitude: number;
  longitude: number;
  address: string | null;
  locationSource: LocationSource;
  videoLink: string | null;
  photoUrl: string | null;
  userId: string;
}

export async function createIssue(input: CreateIssueInput): Promise<Issue> {
  const { data, error } = await supabaseAdmin
    .from("issues")
    .insert({
      category: input.category,
      description: input.description,
      latitude: input.latitude,
      longitude: input.longitude,
      address: input.address,
      location_source: input.locationSource,
      video_link: input.videoLink,
      photo_url: input.photoUrl,
      user_id: input.userId,
    })
    .select()
    .single();

  if (error) throw error;

  return mapRow(data as IssueRow);
}

export async function markIssueResolved(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("issues").update({ status: "resolved" }).eq("id", id);
  if (error) throw error;
}

export async function hideIssue(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("issues").update({ hidden: true }).eq("id", id);
  if (error) throw error;
}
