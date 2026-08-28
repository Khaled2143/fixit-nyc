import { describe, expect, it } from "vitest";
import { daysBetween } from "./dates";

describe("daysBetween", () => {
  it("returns 0 for the same instant", () => {
    const t = "2026-08-20T12:00:00.000Z";
    expect(daysBetween(t, t)).toBe(0);
  });

  it("floors partial days", () => {
    expect(daysBetween("2026-08-20T00:00:00.000Z", "2026-08-21T23:00:00.000Z")).toBe(1);
  });

  it("returns whole days for exact-day gaps", () => {
    expect(daysBetween("2026-08-20T12:00:00.000Z", "2026-08-25T12:00:00.000Z")).toBe(5);
  });

  it("never returns negative values", () => {
    expect(daysBetween("2026-08-25T00:00:00.000Z", "2026-08-20T00:00:00.000Z")).toBe(0);
  });
});
