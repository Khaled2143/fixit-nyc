export const REPORT_THRESHOLD = 3;
export const STRIKE_THRESHOLD = 3;

export interface ReportOutcome {
  shouldHide: boolean;
  strikesAfter: number;
  shouldBan: boolean;
}

export function evaluateReport(reportCountAfterInsert: number, strikesBefore: number): ReportOutcome {
  const shouldHide = reportCountAfterInsert === REPORT_THRESHOLD;
  const strikesAfter = shouldHide ? strikesBefore + 1 : strikesBefore;
  const shouldBan = shouldHide && strikesAfter >= STRIKE_THRESHOLD;
  return { shouldHide, strikesAfter, shouldBan };
}
