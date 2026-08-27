import { beforeEach, describe, expect, it, vi } from "vitest";
import { isPhotoSafe } from "./photoModeration";

const safeSearchDetection = vi.fn();

vi.mock("@google-cloud/vision", () => ({
  default: {
    ImageAnnotatorClient: class {
      safeSearchDetection = safeSearchDetection;
    },
  },
}));

beforeEach(() => {
  safeSearchDetection.mockReset();
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = '{"type":"service_account"}';
});

describe("isPhotoSafe", () => {
  it("returns true when every category is unlikely", async () => {
    safeSearchDetection.mockResolvedValue([
      { safeSearchAnnotation: { adult: "VERY_UNLIKELY", violence: "UNLIKELY", racy: "UNLIKELY" } },
    ]);
    expect(await isPhotoSafe(Buffer.from("fake"))).toBe(true);
  });

  it("returns false when adult content is likely", async () => {
    safeSearchDetection.mockResolvedValue([
      { safeSearchAnnotation: { adult: "LIKELY", violence: "VERY_UNLIKELY", racy: "UNLIKELY" } },
    ]);
    expect(await isPhotoSafe(Buffer.from("fake"))).toBe(false);
  });

  it("returns false when violence is very likely", async () => {
    safeSearchDetection.mockResolvedValue([
      { safeSearchAnnotation: { adult: "UNLIKELY", violence: "VERY_LIKELY", racy: "UNLIKELY" } },
    ]);
    expect(await isPhotoSafe(Buffer.from("fake"))).toBe(false);
  });
});
