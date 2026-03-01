import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOrderDetailHtml } from "../../src/scraper/order-detail";

const FIXTURE_DIR = path.resolve(process.cwd(), "test/fixtures");

async function readFixture(name: string): Promise<string> {
  return fs.readFile(path.join(FIXTURE_DIR, name), "utf8");
}

describe("order detail parser", () => {
  it("parses single-item order fixture", async () => {
    const html = await readFixture("order-detail-single.html");
    const parsed = parseOrderDetailHtml(
      html,
      "https://www.amazon.com/gp/your-account/order-details?orderID=111-2222222-3333333"
    );

    expect(parsed.orderId).toBe("111-2222222-3333333");
    expect(parsed.orderDate).toBe("2026-01-05");
    expect(parsed.orderStatus).toBe("Delivered");
    expect(parsed.paymentMethodMasked).toContain("1234");
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].itemTitle).toBe("Coffee Grinder");
    expect(parsed.items[0].quantity).toBe(2);
    expect(parsed.items[0].itemSubtotal).toBe(25);
    expect(parsed.orderTotal).toBe(29.09);
    expect(parsed.warnings).toHaveLength(0);
  });

  it("parses multi-item fixture", async () => {
    const html = await readFixture("order-detail-multi.html");
    const parsed = parseOrderDetailHtml(
      html,
      "https://www.amazon.com/gp/your-account/order-details?orderID=222-3333333-4444444"
    );

    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].quantity).toBe(3);
    expect(parsed.items[1].quantity).toBe(1);
    expect(parsed.taxAmount).toBe(4.77);
    expect(parsed.orderTotal).toBe(63.77);
  });

  it("handles missing optional fields", async () => {
    const html = await readFixture("order-detail-missing-optional.html");
    const parsed = parseOrderDetailHtml(
      html,
      "https://www.amazon.com/gp/your-account/order-details?orderID=333-4444444-5555555"
    );

    expect(parsed.paymentMethodMasked).toBeNull();
    expect(parsed.shipToCity).toBeNull();
    expect(parsed.items).toHaveLength(1);
    expect(parsed.warnings).toHaveLength(0);
  });

  it("returns warnings for unexpected markup", async () => {
    const html = await readFixture("order-detail-unexpected.html");
    const parsed = parseOrderDetailHtml(html, "https://www.amazon.com/gp/your-account/order-details");

    expect(parsed.items).toHaveLength(0);
    expect(parsed.warnings.some((warning) => warning.includes("No purchasable items"))).toBe(true);
  });
});
