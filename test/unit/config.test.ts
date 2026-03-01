import { describe, expect, it } from "vitest";
import { buildExportConfig } from "../../src/config";

describe("buildExportConfig", () => {
  it("builds config with defaults", () => {
    const config = buildExportConfig({
      from: "2026-01-01",
      to: "2026-01-31",
      out: "./exports"
    });

    expect(config.format).toBe("both");
    expect(config.headless).toBe(false);
    expect(config.maxOrders).toBe(5000);
    expect(config.loginTimeoutSeconds).toBe(900);
  });

  it("throws on reversed date range", () => {
    expect(() =>
      buildExportConfig({
        from: "2026-02-01",
        to: "2026-01-31",
        out: "./exports"
      })
    ).toThrow("--from must be earlier than or equal to --to.");
  });

  it("throws when range exceeds max days", () => {
    expect(() =>
      buildExportConfig({
        from: "2025-01-01",
        to: "2026-12-31",
        out: "./exports"
      })
    ).toThrow("Date range exceeds the configured maximum");
  });

  it("validates format", () => {
    expect(() =>
      buildExportConfig({
        from: "2026-01-01",
        to: "2026-01-31",
        out: "./exports",
        format: "json"
      })
    ).toThrow("format must be one of");
  });
});
