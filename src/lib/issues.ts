import { supabase } from "./supabase";
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
  };
}

export async function getIssues(): Promise<Issue[]> {
  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data as IssueRow[]).map(mapRow);
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
}

export async function createIssue(input: CreateIssueInput): Promise<Issue> {
  const { data, error } = await supabase
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
    })
    .select()
    .single();

  if (error) throw error;

  return mapRow(data as IssueRow);
}
