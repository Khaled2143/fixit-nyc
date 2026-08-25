const NYC_BBOX = "-74.2591,40.4774,-73.7002,40.9176";

export interface GeocodedLocation {
  latitude: number;
  longitude: number;
}

export async function geocodeAddress(address: string): Promise<GeocodedLocation | null> {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", address);
  url.searchParams.set("access_token", process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "");
  url.searchParams.set("bbox", NYC_BBOX);
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString());
  if (!response.ok) return null;

  const data = await response.json();
  const feature = data.features?.[0];
  if (!feature) return null;

  const [longitude, latitude] = feature.geometry.coordinates;
  return { latitude, longitude };
}
