import { supabase } from "./supabase";
import type { Issue, IssueStatus, LocationSource } from "@/types/issue";

interface IssueRow {
  id: string;
  category: string;
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
