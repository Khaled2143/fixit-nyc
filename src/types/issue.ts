export type IssueStatus = "submitted" | "resolved";

export type LocationSource = "address" | "manual_pin" | "latlong";

export interface Issue {
  id: string;
  category: string;
  description: string;
  latitude: number;
  longitude: number;
  address: string | null;
  locationSource: LocationSource;
  status: IssueStatus;
  photoUrl: string | null;
  videoLink: string | null;
  resolvedVia: string | null;
  createdAt: string;
}
