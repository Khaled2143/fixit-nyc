import { describe, expect, it } from "vitest";
import { haversineDistanceMeters, sortByDistanceFrom } from "./distance";

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical points", () => {
    const point = { latitude: 40.7128, longitude: -74.006 };
    expect(haversineDistanceMeters(point, point)).toBe(0);
  });

  it("returns roughly the known distance between Times Square and the Brooklyn Bridge (~6km)", () => {
    const timesSquare = { latitude: 40.758, longitude: -73.9855 };
    const brooklynBridge = { latitude: 40.7061, longitude: -73.9969 };
    const distance = haversineDistanceMeters(timesSquare, brooklynBridge);
    expect(distance).toBeGreaterThan(5800);
    expect(distance).toBeLessThan(6200);
  });
});

describe("sortByDistanceFrom", () => {
  const anchor = { latitude: 40.7128, longitude: -74.006 };
  const near = { id: "near", latitude: 40.713, longitude: -74.0062 };
  const far = { id: "far", latitude: 40.9, longitude: -73.8 };
  const middle = { id: "middle", latitude: 40.75, longitude: -73.99 };

  it("orders items from nearest to farthest from the anchor", () => {
    const result = sortByDistanceFrom([far, near, middle], anchor);
    expect(result.map((r) => r.id)).toEqual(["near", "middle", "far"]);
  });

  it("does not mutate the input array", () => {
    const input = [far, near, middle];
    const originalOrder = input.map((i) => i.id);
    sortByDistanceFrom(input, anchor);
    expect(input.map((i) => i.id)).toEqual(originalOrder);
  });
});
