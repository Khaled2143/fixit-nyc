import { describe, expect, it } from "vitest";
import { containsProfanity } from "./profanityFilter";

describe("containsProfanity", () => {
  it("returns false for a normal description", () => {
    expect(containsProfanity("There's a large pothole outside 123 Main St.")).toBe(false);
  });

  it("returns true when the text contains a blocked word", () => {
    expect(containsProfanity("this pothole is a piece of shit")).toBe(true);
  });
});
