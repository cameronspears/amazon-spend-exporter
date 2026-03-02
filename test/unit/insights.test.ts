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
    item_price: null,
    item_subtotal: null,
    shipping_amount: 0,
    tax_amount: 0,
    discount_amount: 0,
    order_total: null,
    payment_method_masked: null,
    ship_to_city: null,
    ship_to_state: null,
    ship_to_country: null,
    invoice_url: null,
    order_detail_url: "https://example.com/order",
    currency: "USD",
    source_marketplace: "amazon.com",
    exported_at: "2026-01-01T00:00:00.000Z",
    ...partial
  };
}

describe("aggregateInsights", () => {
  it("returns a fully-populated payload for empty rows", () => {
    const insights = aggregateInsights([]);
    expect(insights.totals.spend).toBe(0);
    expect(insights.byMonth).toEqual([]);
    expect(insights.outliers.months).toEqual([]);
    expect(insights.monthDrilldowns).toEqual([]);
    expect(insights.forecast.next3MonthsProjectedSpend).toEqual([]);
  });

  it("computes advanced metrics, month drilldowns, and quality coverage", () => {
    const rows: OrderItemRow[] = [
      makeRow({
        order_id: "A-1",
        order_date: "2025-01-10",
        item_title: "Desk Chair",
        quantity: 1,
        order_total: 100,
        shipping_amount: 5,
        tax_amount: 10,
        discount_amount: 0,
        order_detail_url: "https://example.com/order/A-1"
      }),
      makeRow({
        order_id: "A-1",
        order_date: "2025-01-10",
        item_title: "Chair Wheels",
        quantity: 1,
        order_total: 100,
        shipping_amount: 5,
        tax_amount: 10,
        discount_amount: 0,
        order_detail_url: "https://example.com/order/A-1"
      }),
      makeRow({
        order_id: "A-2",
        order_date: "2025-01-20",
        item_title: "Keyboard",
        quantity: 1,
        item_subtotal: 30,
        order_total: null,
        order_detail_url: "https://example.com/order/A-2"
      }),
      makeRow({
        order_id: "A-3",
        order_date: "2025-02-05",
        item_title: "Dog Treats",
        quantity: 2,
        order_total: 40,
        shipping_amount: 0,
        tax_amount: 4,
        discount_amount: 5,
        order_detail_url: "https://example.com/order/A-3"
      }),
      makeRow({
        order_id: "A-4",
        order_date: "2025-03-07",
        item_title: "USB Cable",
        quantity: 3,
        order_total: 60,
        shipping_amount: 2,
        tax_amount: 3,
        discount_amount: 0,
        order_detail_url: "https://example.com/order/A-4"
      }),
      makeRow({
        order_id: "A-5",
        order_date: "2025-04-16",
        item_title: "Notebook",
        quantity: 4,
        order_total: 70,
        shipping_amount: 2,
        tax_amount: 5,
        discount_amount: 1,
        order_detail_url: "https://example.com/order/A-5"
      }),
      makeRow({
        order_id: "A-6",
        order_date: "2025-07-01",
        item_title: "Monitor",
        quantity: 1,
        order_total: 300,
        shipping_amount: 7,
        tax_amount: 20,
        discount_amount: 0,
        order_detail_url: "https://example.com/order/A-6"
      }),
      makeRow({
        order_id: "A-7",
        order_date: "2025-07-15",
        item_title: "Standing Desk",
        quantity: 1,
        order_total: 250,
        shipping_amount: 6,
        tax_amount: 18,
        discount_amount: 10,
        order_detail_url: "https://example.com/order/A-7"
      })
    ];

    const insights = aggregateInsights(rows, 10);

    expect(insights.totals.spend).toBe(850);
    expect(insights.totals.orderCount).toBe(7);
    expect(insights.totals.itemCount).toBe(14);

    expect(insights.byMonth.find((month) => month.period === "2025-07")?.spend).toBe(550);
    expect(insights.outliers.months.some((month) => month.period === "2025-07")).toBe(true);

    expect(insights.monthDrilldowns.find((month) => month.period === "2025-07")?.topOrders[0].orderTotal).toBe(300);

    expect(insights.valueProfile.averageOrderValue).toBe(121.43);
    expect(insights.valueProfile.maxOrderValue).toBe(300);
    expect(insights.valueProfile.minOrderValueNonZero).toBe(30);

    expect(insights.growth.mom.find((month) => month.period === "2025-07")?.spendDelta).toBe(480);

    expect(insights.costBreakdown.shippingTotal).toBe(22);
    expect(insights.costBreakdown.taxTotal).toBe(60);
    expect(insights.costBreakdown.discountTotal).toBe(16);
    expect(insights.costBreakdown.estimatedMerchandiseTotal).toBe(784);

    expect(insights.items.topByCount[0].itemTitle).toBe("Notebook");
    expect(insights.concentration.top1OrdersSharePct).toBe(35.29);
    expect(insights.concentration.top5OrdersSharePct).toBe(91.76);

    expect(insights.forecast.annualizedRunRate90d).toBeGreaterThan(0);
    expect(insights.forecast.next3MonthsProjectedSpend).toHaveLength(3);

    expect(insights.quality.orderTotalCoveragePct).toBe(85.71);
    expect(insights.quality.itemSpendCoveragePct).toBe(12.5);
    expect(insights.quality.spendFromOrderLevelPct).toBe(96.47);
    expect(insights.quality.spendFromItemLevelPct).toBe(3.53);

    // Backward compatibility field remains available.
    expect(insights.topItems.length).toBeGreaterThan(0);
  });
});
