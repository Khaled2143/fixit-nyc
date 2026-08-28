export type IssueStatus = "submitted" | "resolved";

export const LOCATION_SOURCES = ["address", "manual_pin", "latlong"] as const;
export type LocationSource = (typeof LOCATION_SOURCES)[number];

export const ISSUE_CATEGORIES = [
  "Pothole",
  "Broken streetlight",
  "Illegal dumping",
  "Graffiti",
  "Damaged sidewalk",
  "Downed tree/branch",
  "Other",
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export interface Issue {
  id: string;
  category: IssueCategory;
  description: string;
  latitude: number;
  longitude: number;
  address: string | null;
  locationSource: LocationSource;
  status: IssueStatus;
  photoUrl: string | null;
  videoLink: string | null;
  resolvedVia: string | null;
  resolvedAt: string | null;
  meTooCount: number;
  createdAt: string;
  userId: string | null;
  hidden: boolean;
}
