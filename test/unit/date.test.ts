import { describe, expect, it } from "vitest";
import {
  daysBetweenInclusive,
  isDateInRange,
  parseDateFromText,
  parseIsoDateStrict
} from "../../src/normalize/date";

describe("date normalization", () => {
  it("parses strict ISO dates", () => {
    expect(parseIsoDateStrict("2026-01-15")?.toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(parseIsoDateStrict("2026-13-15")).toBeNull();
    expect(parseIsoDateStrict("15-01-2026")).toBeNull();
  });

  it("extracts month name and numeric dates from text", () => {
    expect(parseDateFromText("Ordered on January 5, 2026")).toBe("2026-01-05");
    expect(parseDateFromText("ORDER PLACED: 02/12/2026")).toBe("2026-02-12");
  });

  it("checks date ranges", () => {
    expect(isDateInRange("2026-01-10", "2026-01-01", "2026-01-31")).toBe(true);
    expect(isDateInRange("2026-02-01", "2026-01-01", "2026-01-31")).toBe(false);
  });

  it("computes inclusive date span", () => {
    expect(daysBetweenInclusive("2026-01-01", "2026-01-01")).toBe(1);
    expect(daysBetweenInclusive("2026-01-01", "2026-01-31")).toBe(31);
  });
});
