import { describe, expect, it } from "vitest";
import { isValidUsername } from "./username";

describe("isValidUsername", () => {
  it("accepts a normal username", () => {
    expect(isValidUsername("khaled_99")).toBe(true);
  });

  it("rejects usernames shorter than 3 characters", () => {
    expect(isValidUsername("ab")).toBe(false);
  });

  it("rejects usernames longer than 20 characters", () => {
    expect(isValidUsername("a".repeat(21))).toBe(false);
  });

  it("rejects characters outside letters, numbers, and underscore", () => {
    expect(isValidUsername("bad name!")).toBe(false);
  });
});
