import { describe, expect, it } from "vitest";
import { parseMoney } from "../../src/normalize/money";

describe("parseMoney", () => {
  it("parses USD with comma separators", () => {
    const result = parseMoney("$1,234.56");
    expect(result.amount).toBe(1234.56);
    expect(result.currency).toBe("USD");
  });

  it("parses negative amounts", () => {
    expect(parseMoney("-$5.00").amount).toBe(-5);
    expect(parseMoney("($7.25)").amount).toBe(-7.25);
  });

  it("returns null amount when no numeric value exists", () => {
    const result = parseMoney("N/A", "USD");
    expect(result.amount).toBeNull();
    expect(result.currency).toBe("USD");
  });
});
