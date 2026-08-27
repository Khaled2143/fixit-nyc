import { describe, expect, it } from "vitest";
import { evaluateReport } from "./reportModeration";

describe("evaluateReport", () => {
  it("does nothing below the report threshold", () => {
    expect(evaluateReport(1, 0)).toEqual({ shouldHide: false, strikesAfter: 0, shouldBan: false });
    expect(evaluateReport(2, 0)).toEqual({ shouldHide: false, strikesAfter: 0, shouldBan: false });
  });

  it("hides the issue and adds a strike when reports reach exactly 3", () => {
    expect(evaluateReport(3, 0)).toEqual({ shouldHide: true, strikesAfter: 1, shouldBan: false });
  });

  it("does not re-trigger past the threshold", () => {
    expect(evaluateReport(4, 1)).toEqual({ shouldHide: false, strikesAfter: 1, shouldBan: false });
  });

  it("bans when the new strike count reaches 3", () => {
    expect(evaluateReport(3, 2)).toEqual({ shouldHide: true, strikesAfter: 3, shouldBan: true });
  });

  it("does not ban below the strike threshold", () => {
    expect(evaluateReport(3, 1)).toEqual({ shouldHide: true, strikesAfter: 2, shouldBan: false });
  });
});
