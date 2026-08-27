export interface LatLong {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6371000;

export function haversineDistanceMeters(a: LatLong, b: LatLong): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function sortByDistanceFrom<T extends LatLong>(items: T[], anchor: LatLong): T[] {
  return [...items].sort(
    (a, b) => haversineDistanceMeters(anchor, a) - haversineDistanceMeters(anchor, b),
  );
}
