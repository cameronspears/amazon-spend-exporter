import { describe, expect, it } from "vitest";
import { aggregateInsights } from "../../src/insights/aggregate";
import { OrderItemRow } from "../../src/types";

function makeRow(partial: Partial<OrderItemRow>): OrderItemRow {
  return {
    order_id: "111-1111111-1111111",
    order_date: "2025-01-01",
    order_status: "Delivered",
    item_title: "Item",
    asin_or_sku: null,
    quantity: 1,
    item_price: 10,
    item_subtotal: 10,
    shipping_amount: 0,
    tax_amount: 0,
    discount_amount: 0,
    order_total: 10,
    payment_method_masked: null,
    ship_to_city: null,
    ship_to_state: null,
    ship_to_country: null,
    invoice_url: null,
    order_detail_url: "https://example.com",
    currency: "USD",
    source_marketplace: "amazon.com",
    exported_at: "2026-01-01T00:00:00.000Z",
    ...partial
  };
}

describe("aggregateInsights", () => {
  it("aggregates spend and counts with subtotal fallback", () => {
    const rows: OrderItemRow[] = [
      makeRow({
        order_id: "111-1111111-1111111",
        order_date: "2025-01-02",
        item_title: "Paper",
        quantity: 2,
        item_subtotal: null,
        item_price: 5
      }),
      makeRow({
        order_id: "111-1111111-1111111",
        order_date: "2025-01-02",
        item_title: "Pens",
        quantity: 1,
        item_subtotal: 3
      }),
      makeRow({
        order_id: "222-2222222-2222222",
        order_date: "2026-02-10",
        item_title: "[Order captured; item details unavailable]",
        quantity: 0,
        item_subtotal: null,
        item_price: null
      })
    ];

    const insights = aggregateInsights(rows, 5);
    expect(insights.totals.orderCount).toBe(2);
    expect(insights.totals.itemCount).toBe(3);
    expect(insights.totals.spend).toBe(13);
    expect(insights.byYear.find((x) => x.period === "2025")?.spend).toBe(13);
    expect(insights.byYear.find((x) => x.period === "2026")?.spend).toBe(0);
    expect(insights.topItems[0].itemTitle).toBe("Paper");
  });
});
