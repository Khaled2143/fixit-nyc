import { describe, expect, it } from "vitest";
import { isSupportedVideoLink } from "./linkParsing";

describe("isSupportedVideoLink", () => {
  it("accepts a TikTok URL", () => {
    expect(isSupportedVideoLink("https://www.tiktok.com/@user/video/123")).toBe(true);
  });

  it("accepts an Instagram URL", () => {
    expect(isSupportedVideoLink("https://instagram.com/reel/abc")).toBe(true);
  });

  it("rejects an unsupported host", () => {
    expect(isSupportedVideoLink("https://youtube.com/watch?v=123")).toBe(false);
  });

  it("rejects a malformed URL", () => {
    expect(isSupportedVideoLink("not a url")).toBe(false);
  });
});
