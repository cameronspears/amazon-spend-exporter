import { describe, expect, it } from "vitest";
import {
  buildSeedOrderHistoryUrls,
  dedupeOrderRefs,
  parseOrderListHtml
} from "../../src/scraper/orders-list";

describe("orders list parser", () => {
  it("deduplicates orders by orderId", () => {
    const deduped = dedupeOrderRefs([
      {
        orderId: "111-1111111-1111111",
        orderDate: "2026-01-01",
        detailUrl: "https://www.amazon.com/gp/your-account/order-details?orderID=111"
      },
      {
        orderId: "111-1111111-1111111",
        orderDate: "2026-01-01",
        detailUrl: "https://www.amazon.com/gp/your-account/order-details?orderID=111"
      },
      {
        orderId: "222-2222222-2222222",
        orderDate: "2026-01-02",
        detailUrl: "https://www.amazon.com/gp/your-account/order-details?orderID=222"
      }
    ]);

    expect(deduped).toHaveLength(2);
  });

  it("parses order cards and next page url", () => {
    const html = `
      <div data-order-id="111-1111111-1111111">
        <span>Order placed January 10, 2026</span>
        <a href="/gp/your-account/order-details?orderID=111-1111111-1111111">Order details</a>
      </div>
      <li class="a-last"><a href="/gp/your-account/order-history/ref=ppx_yo_dt_b_pagination_2">Next</a></li>
    `;

    const parsed = parseOrderListHtml(html, "https://www.amazon.com/gp/your-account/order-history");
    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0].orderDate).toBe("2026-01-10");
    expect(parsed.nextPageUrl).toContain("pagination_2");
  });

  it("builds year seed urls across requested range", () => {
    const seeds = buildSeedOrderHistoryUrls("2024-03-01", "2026-03-01");
    expect(seeds[0].label).toBe("fallback-year-2026");
    expect(seeds.some((seed) => seed.url.includes("orderFilter=year-2026"))).toBe(true);
    expect(seeds.some((seed) => seed.url.includes("timeFilter=year-2026"))).toBe(true);
    expect(seeds.some((seed) => seed.url.includes("orderFilter=year-2024"))).toBe(true);
    expect(seeds.some((seed) => seed.url.includes("timeFilter=year-2024"))).toBe(true);
  });

  it("prefers order id from details link over surrounding text", () => {
    const html = `
      <div>
        ORDER # 999-9999999-9999999
        <a href="/gp/your-account/order-details?orderID=111-1111111-1111111">View order details</a>
        <span>Order placed January 10, 2026</span>
      </div>
    `;

    const parsed = parseOrderListHtml(html, "https://www.amazon.com/gp/your-account/order-history");
    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0].orderId).toBe("111-1111111-1111111");
  });

  it("extracts order refs from ORDER PLACED / ORDER # text blocks when links are missing", () => {
    const html = `
      <div>
        <span>ORDER PLACED January 2, 2025</span>
        <span>ORDER # 123-1234567-1234567</span>
      </div>
    `;

    const parsed = parseOrderListHtml(html, "https://www.amazon.com/gp/your-account/order-history");
    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0].orderId).toBe("123-1234567-1234567");
    expect(parsed.orders[0].detailUrl).toContain("orderID=123-1234567-1234567");
  });
});
