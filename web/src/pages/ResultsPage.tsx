import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { buildDownloadUrl, fetchInsights, fetchRun, fetchWarnings } from "../api";
import { StatusPill } from "../components/StatusPill";
import { ExportRun, InsightsMonthDrilldown, InsightsPayload } from "../types";

const DASHBOARD_SECTIONS: Array<{ id: string; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "trends", label: "Monthly Spend" },
  { id: "month-details", label: "Month Details" },
  { id: "costs", label: "Shipping & Tax" }
];

const DEMO_INSIGHTS: InsightsPayload = {
  totals: {
    spend: 6382.43,
    orderCount: 226,
    itemCount: 371
  },
  byYear: [
    { period: "2024", spend: 2210.32, orderCount: 74, itemCount: 118 },
    { period: "2025", spend: 3380.64, orderCount: 132, itemCount: 197 },
    { period: "2026", spend: 791.47, orderCount: 20, itemCount: 56 }
  ],
  byMonth: [
    { period: "2025-07", spend: 1251.82, orderCount: 26, itemCount: 37 },
    { period: "2025-08", spend: 312.4, orderCount: 12, itemCount: 20 },
    { period: "2025-09", spend: 287.02, orderCount: 10, itemCount: 16 },
    { period: "2025-10", spend: 365.11, orderCount: 15, itemCount: 24 },
    { period: "2025-11", spend: 401.77, orderCount: 17, itemCount: 25 },
    { period: "2025-12", spend: 592.9, orderCount: 23, itemCount: 31 },
    { period: "2026-01", spend: 438.14, orderCount: 14, itemCount: 20 },
    { period: "2026-02", spend: 353.33, orderCount: 11, itemCount: 17 }
  ],
  topItems: [
    { itemTitle: "Chef'sChoice 15XV Knife Sharpener", spend: 182.9, purchases: 2 },
    { itemTitle: "AMD Ryzen 5 5600G", spend: 146.13, purchases: 2 },
    { itemTitle: "Shark Navigator Vacuum", spend: 140.71, purchases: 2 }
  ],
  valueProfile: {
    averageOrderValue: 28.24,
    medianOrderValue: 19.93,
    minOrderValueNonZero: 1.29,
    maxOrderValue: 212.51,
    p25OrderValue: 10.83,
    p75OrderValue: 41.02,
    p90OrderValue: 79.46
  },
  growth: {
    yoy: [],
    mom: [],
    rolling3: [],
    rolling6: []
  },
  outliers: {
    months: [{ period: "2025-07", spend: 1251.82, score: 8.11, severity: "strong" }],
    orders: []
  },
  costBreakdown: {
    shippingTotal: 123.45,
    taxTotal: 512.34,
    discountTotal: 88.1,
    estimatedMerchandiseTotal: 5834.74,
    shippingPctOfSpend: 1.93,
    taxPctOfSpend: 8.03,
    discountPctOfSpend: 1.38
  },
  behavior: {
    avgOrdersPerMonth: 14.13,
    avgDaysBetweenOrders: 3.2,
    longestGapDays: 18,
    topWeekdayBySpend: { weekday: "Sunday", spend: 1151.33 },
    topWeekdayByOrders: { weekday: "Tuesday", orders: 42 }
  },
  items: {
    topByCount: [
      { itemTitle: "Amazon Basics Coffee Filters", purchases: 16, orderCount: 12 },
      { itemTitle: "Dog Harness", purchases: 8, orderCount: 4 }
    ],
    topBySpend: [
      { itemTitle: "Chef'sChoice 15XV Knife Sharpener", spend: 182.9, purchases: 2 },
      { itemTitle: "AMD Ryzen 5 5600G", spend: 146.13, purchases: 2 }
    ],
    repeatItemRatePct: 22.8
  },
  concentration: {
    top1OrdersSharePct: 3.33,
    top5OrdersSharePct: 12.98,
    top10OrdersSharePct: 21.24,
    top5ItemsSpendSharePct: 9.1
  },
  forecast: {
    annualizedRunRate90d: 5220.55,
    next3MonthsProjectedSpend: [
      { period: "2026-03", projectedSpend: 461.46 },
      { period: "2026-04", projectedSpend: 461.46 },
      { period: "2026-05", projectedSpend: 461.46 }
    ],
    confidence: "medium"
  },
  quality: {
    orderTotalCoveragePct: 100,
    itemSpendCoveragePct: 38.2,
    spendFromOrderLevelPct: 88.1,
    spendFromItemLevelPct: 11.9
  },
  monthDrilldowns: [
    {
      period: "2025-07",
      spend: 1251.82,
      orderCount: 26,
      itemCount: 37,
      averageOrderValue: 48.15,
      topOrders: [
        {
          orderId: "111-5605200-1153850",
          orderDate: "2025-07-24",
          orderTotal: 212.51,
          itemCount: 2,
          itemTitles: ["Custom holographic vinyl decals", "USB adapter"],
          orderDetailUrl: "https://www.amazon.com/your-orders/order-details?orderID=111-5605200-1153850"
        },
        {
          orderId: "112-4369406-4261010",
          orderDate: "2025-07-28",
          orderTotal: 196.44,
          itemCount: 3,
          itemTitles: ["SAMSUNG BAR Plus USB Flash Drive", "Padded envelope", "Screen wipes"],
          orderDetailUrl: "https://www.amazon.com/your-orders/order-details?orderID=112-4369406-4261010"
        }
      ],
      topItemsByCount: [
        { itemTitle: "USB Adapter", purchases: 5, orderCount: 4 },
        { itemTitle: "Coffee Filters", purchases: 4, orderCount: 3 },
        { itemTitle: "Dog Treats", purchases: 3, orderCount: 2 }
      ]
    },
    {
      period: "2025-12",
      spend: 592.9,
      orderCount: 23,
      itemCount: 31,
      averageOrderValue: 25.78,
      topOrders: [
        {
          orderId: "112-2246180-2507406",
          orderDate: "2025-12-26",
          orderTotal: 182.9,
          itemCount: 2,
          itemTitles: ["Chef'sChoice 15XV Knife Sharpener", "Knife Guard"],
          orderDetailUrl: "https://www.amazon.com/your-orders/order-details?orderID=112-2246180-2507406"
        }
      ],
      topItemsByCount: [
        { itemTitle: "Peak Design Strap", purchases: 4, orderCount: 3 },
        { itemTitle: "Coffee Filters", purchases: 3, orderCount: 2 }
      ]
    }
  ]
};

function toMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function toPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function topMonth(insights: InsightsPayload): { period: string; spend: number } | null {
  return [...insights.byMonth].sort((a, b) => b.spend - a.spend)[0] ?? null;
}

function summaryLine(insights: InsightsPayload): string {
  const month = topMonth(insights);
  if (!month || insights.totals.spend <= 0) {
    return "Use the monthly chart to inspect your spending pattern.";
  }
  const share = (month.spend / insights.totals.spend) * 100;
  return `${month.period} was your highest month at ${toMoney(month.spend)} (${share.toFixed(1)}% of total spend).`;
}

function defaultSelectedMonth(insights: InsightsPayload | null): string | null {
  if (!insights || insights.byMonth.length === 0) {
    return null;
  }
  return topMonth(insights)?.period ?? insights.byMonth[0].period;
}

export function ResultsPage(): JSX.Element {
  const { runId = "" } = useParams();
  const [run, setRun] = useState<ExportRun | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [insights, setInsights] = useState<InsightsPayload | null>(runId === "demo" ? DEMO_INSIGHTS : null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(defaultSelectedMonth(runId === "demo" ? DEMO_INSIGHTS : null));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId || runId === "demo") {
      return;
    }

    let isMounted = true;

    const load = async (): Promise<void> => {
      try {
        const [runResponse, warningResponse, insightResponse] = await Promise.all([
          fetchRun(runId),
          fetchWarnings(runId),
          fetchInsights(runId)
        ]);

        if (!isMounted) {
          return;
        }

        setRun(runResponse);
        setWarnings(warningResponse);
        setInsights(insightResponse);
        setSelectedMonth(defaultSelectedMonth(insightResponse));
        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    };

    load().catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [runId]);

  const monthSeries = useMemo(() => {
    if (!insights) {
      return [];
    }

    const maxSpend = insights.byMonth.reduce((max, item) => Math.max(max, item.spend), 0) || 1;
    return insights.byMonth.map((item) => ({
      ...item,
      width: `${Math.max(6, Math.round((item.spend / maxSpend) * 100))}%`
    }));
  }, [insights]);

  const unusualMonths = insights?.outliers.months.slice(0, 3) ?? [];
  const mostExpensiveItem = insights?.items.topBySpend[0] ?? null;

  const selectedDrilldown = useMemo<InsightsMonthDrilldown | null>(() => {
    if (!insights || !selectedMonth) {
      return null;
    }

    return insights.monthDrilldowns.find((month) => month.period === selectedMonth) ?? null;
  }, [insights, selectedMonth]);

  return (
    <main className="page page-results">
      <section className="panel reveal">
        <div className="panel-header">
          <h1>Results</h1>
          {run ? <StatusPill status={run.status} /> : null}
        </div>
        {error ? <p className="error-text">{error}</p> : null}

        {runId === "demo" ? <p>Demo view of the post-export experience.</p> : null}

        {run ? (
          <div className="download-grid">
            {run.files.map((file) => (
              <a key={file.name} className="button button-primary" href={buildDownloadUrl(run.runId, file.name)}>
                Download {file.name}
              </a>
            ))}
            {run.warningFile ? (
              <a className="button button-ghost" href={buildDownloadUrl(run.runId, run.warningFile.name)}>
                Download Warnings Log
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      {insights ? (
        <section className="panel reveal reveal-delay-1">
          <h2>Spend Dashboard</h2>

          <div className="anchor-nav" role="navigation" aria-label="Insights sections">
            {DASHBOARD_SECTIONS.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.label}
              </a>
            ))}
          </div>

          <article id="overview" className="section-block">
            <h3>Overview</h3>
            <div className="stats-grid stats-grid-wide">
              <article>
                <h3>Total Spend</h3>
                <p>{toMoney(insights.totals.spend)}</p>
              </article>
              <article>
                <h3>Orders</h3>
                <p>{insights.totals.orderCount}</p>
              </article>
              <article>
                <h3>Items</h3>
                <p>{insights.totals.itemCount}</p>
              </article>
              <article>
                <h3>Average Order Value</h3>
                <p>{toMoney(insights.valueProfile.averageOrderValue)}</p>
              </article>
              <article>
                <h3>Median Order Value</h3>
                <p>{toMoney(insights.valueProfile.medianOrderValue)}</p>
              </article>
              <article>
                <h3>Max Order Value</h3>
                <p>{toMoney(insights.valueProfile.maxOrderValue)}</p>
              </article>
              <article>
                <h3>Most Expensive Item</h3>
                <p>{mostExpensiveItem ? toMoney(mostExpensiveItem.spend) : "Unavailable"}</p>
                <small>{mostExpensiveItem ? mostExpensiveItem.itemTitle : "No item-level price data available"}</small>
              </article>
            </div>
            <p className="insight-callout">{summaryLine(insights)}</p>
          </article>

          <article id="trends" className="section-block">
            <h3>Monthly Spend</h3>
            <p>Click any month to see what drove that month.</p>
            <div className="bar-list">
              {monthSeries.map((item) => (
                <button
                  type="button"
                  className={`bar-row bar-button ${selectedMonth === item.period ? "is-active" : ""}`}
                  key={item.period}
                  onClick={() => setSelectedMonth(item.period)}
                  aria-pressed={selectedMonth === item.period}
                >
                  <span>{item.period}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: item.width }} />
                  </div>
                  <strong>{toMoney(item.spend)}</strong>
                </button>
              ))}
            </div>

            <div className="chip-row">
              {unusualMonths.length === 0 ? <span className="mono">No unusual spend spikes detected.</span> : null}
              {unusualMonths.map((month) => (
                <span key={month.period} className="status-pill status-completed_with_warnings">
                  Unusual month: {month.period} ({toMoney(month.spend)})
                </span>
              ))}
            </div>
          </article>

          <article id="month-details" className="section-block">
            <h3>Month Details</h3>
            {selectedDrilldown ? (
              <>
                <div className="stats-grid">
                  <article>
                    <h3>Month</h3>
                    <p>{selectedDrilldown.period}</p>
                  </article>
                  <article>
                    <h3>Spend</h3>
                    <p>{toMoney(selectedDrilldown.spend)}</p>
                  </article>
                  <article>
                    <h3>Orders</h3>
                    <p>{selectedDrilldown.orderCount}</p>
                  </article>
                </div>

                <div className="table-grid">
                  <div className="table-shell">
                    <h4>Top Orders</h4>
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Top Item</th>
                          <th>Total</th>
                          <th>Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDrilldown.topOrders.map((order) => (
                          <tr key={order.orderId}>
                            <td>{order.orderDate}</td>
                            <td>
                              <div>{order.itemTitles[0] ?? "Item unavailable"}</div>
                              <div className="mono">Order {order.orderId}</div>
                            </td>
                            <td>{toMoney(order.orderTotal)}</td>
                            <td>
                              {order.orderDetailUrl ? (
                                <a href={order.orderDetailUrl} target="_blank" rel="noreferrer">
                                  View
                                </a>
                              ) : (
                                "-"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="table-shell">
                    <h4>Most Purchased Items</h4>
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Purchases</th>
                          <th>Orders</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDrilldown.topItemsByCount.map((item) => (
                          <tr key={item.itemTitle}>
                            <td>{item.itemTitle}</td>
                            <td>{item.purchases}</td>
                            <td>{item.orderCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <p>Select a month in Monthly Spend.</p>
            )}
          </article>

          <article id="costs" className="section-block">
            <h3>Shipping & Tax</h3>
            <div className="stats-grid stats-grid-wide">
              <article>
                <h3>Shipping</h3>
                <p>{toMoney(insights.costBreakdown.shippingTotal)}</p>
                <small>{toPercent(insights.costBreakdown.shippingPctOfSpend)} of spend</small>
              </article>
              <article>
                <h3>Tax</h3>
                <p>{toMoney(insights.costBreakdown.taxTotal)}</p>
                <small>{toPercent(insights.costBreakdown.taxPctOfSpend)} of spend</small>
              </article>
              <article>
                <h3>Discount</h3>
                <p>{toMoney(insights.costBreakdown.discountTotal)}</p>
                <small>{toPercent(insights.costBreakdown.discountPctOfSpend)} of spend</small>
              </article>
            </div>
          </article>
        </section>
      ) : null}

      <section className="panel reveal reveal-delay-2">
        <h2>Warnings Summary</h2>
        {warnings.length === 0 ? <p>No warnings in this run.</p> : null}
        <ul className="warning-list">
          {warnings.slice(0, 30).map((warning, index) => (
            <li key={`${warning}-${index}`}>{warning}</li>
          ))}
        </ul>
        {warnings.length > 30 ? <p>Showing first 30 warnings. Download the full warnings log for all entries.</p> : null}
      </section>

      <div className="actions-row">
        <Link to="/export" className="button button-ghost">
          Start Another Export
        </Link>
      </div>
    </main>
  );
}
