import { describe, expect, it } from "vitest";
import { monthEnd, reportRange } from "../src/domain/report-range";

describe("report ranges", () => {
  it("includes the current month and eleven preceding months across years", () => {
    expect(reportRange("last12", "2026-01-15")).toEqual({
      from: "2025-02-01",
      to: "2026-01-15",
    });
  });
  it("ends year to date on the household's current date", () => {
    expect(reportRange("ytd", "2026-09-07")).toEqual({
      from: "2026-01-01",
      to: "2026-09-07",
    });
  });
  it("includes the last day of custom months, including leap years", () => {
    expect(monthEnd("2024-02")).toBe("2024-02-29");
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2026-12")).toBe("2026-12-31");
  });
});
