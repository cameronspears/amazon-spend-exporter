import {
  ForecastConfidence,
  InsightsMonthDrilldown,
  InsightsMonthOutlier,
  InsightsOrderOutlier,
  InsightsPayload,
  InsightsPeriodValue,
  InsightsTopItem,
  InsightsTopItemByCount,
  OrderItemRow
} from "../types";

const PLACEHOLDER_TITLE = "[Order captured; item details unavailable]";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface PeriodAccumulator {
  spend: number;
  itemCount: number;
  orderCount: number;
}

interface ItemSpendAccumulator {
  spend: number;
  purchases: number;
}

interface ItemCountAccumulator {
  purchases: number;
  orders: Set<string>;
}

type SpendSource = "order_level" | "item_level" | "none";

interface OrderFact {
  orderId: string;
  orderDate: string;
  timestamp: number;
  orderDetailUrl: string | null;
  itemCount: number;
  itemSpend: number;
  orderTotal: number | null;
  shippingAmount: number | null;
  taxAmount: number | null;
  discountAmount: number | null;
  itemTitles: Map<string, true>;
  itemCounts: Map<string, number>;
}

interface OrderSummary {
  orderId: string;
  orderDate: string;
  timestamp: number;
  orderDetailUrl: string | null;
  orderSpend: number;
  spendSource: SpendSource;
  itemCount: number;
  itemTitles: string[];
  itemCounts: Map<string, number>;
  orderTotal: number | null;
  shippingAmount: number;
  taxAmount: number;
  discountAmount: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function getFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function getNonNegativeNumber(value: unknown): number | null {
  const num = getFiniteNumber(value);
  if (num === null || num < 0) {
    return null;
  }
  return num;
}

function isOrderDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseIsoDayToUtcMs(value: string): number | null {
  if (!isOrderDate(value)) {
    return null;
  }

  const [y, m, d] = value.split("-").map((segment) => Number(segment));
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return null;
  }

  return Date.UTC(y, m - 1, d);
}

function getItemSpend(row: OrderItemRow): number {
  if (typeof row.item_subtotal === "number" && Number.isFinite(row.item_subtotal)) {
    return row.item_subtotal;
  }

  if (
    typeof row.item_price === "number" &&
    Number.isFinite(row.item_price) &&
    typeof row.quantity === "number" &&
    Number.isFinite(row.quantity) &&
    row.quantity > 0
  ) {
    return row.item_price * row.quantity;
  }

  return 0;
}

function getItemCount(row: OrderItemRow): number {
  if (typeof row.quantity === "number" && Number.isFinite(row.quantity) && row.quantity > 0) {
    return row.quantity;
  }
  return 0;
}

function nonPlaceholderTitle(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === PLACEHOLDER_TITLE) {
    return null;
  }
  return trimmed;
}

function ensurePeriod(map: Map<string, PeriodAccumulator>, key: string): PeriodAccumulator {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const created: PeriodAccumulator = {
    spend: 0,
    itemCount: 0,
    orderCount: 0
  };
  map.set(key, created);
  return created;
}

function ensureOrder(orders: Map<string, OrderFact>, row: OrderItemRow, timestamp: number): OrderFact {
  const existing = orders.get(row.order_id);
  if (existing) {
    return existing;
  }

  const created: OrderFact = {
    orderId: row.order_id,
    orderDate: row.order_date,
    timestamp,
    orderDetailUrl: row.order_detail_url?.trim() ? row.order_detail_url : null,
    itemCount: 0,
    itemSpend: 0,
    orderTotal: null,
    shippingAmount: null,
    taxAmount: null,
    discountAmount: null,
    itemTitles: new Map<string, true>(),
    itemCounts: new Map<string, number>()
  };
  orders.set(row.order_id, created);
  return created;
}

function ensureItemCount(map: Map<string, ItemCountAccumulator>, title: string): ItemCountAccumulator {
  const existing = map.get(title);
  if (existing) {
    return existing;
  }

  const created: ItemCountAccumulator = {
    purchases: 0,
    orders: new Set<string>()
  };
  map.set(title, created);
  return created;
}

function ensureItemSpend(map: Map<string, ItemSpendAccumulator>, title: string): ItemSpendAccumulator {
  const existing = map.get(title);
  if (existing) {
    return existing;
  }

  const created: ItemSpendAccumulator = {
    spend: 0,
    purchases: 0
  };
  map.set(title, created);
  return created;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function percentile(values: number[], pct: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const clamped = Math.max(0, Math.min(1, pct));
  const index = (sorted.length - 1) * clamped;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function pct(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return round2((part / total) * 100);
}

function buildRollingSeries(byMonth: InsightsPeriodValue[], windowSize: number): Array<{ period: string; spend: number }> {
  if (windowSize <= 0 || byMonth.length < windowSize) {
    return [];
  }

  const values: Array<{ period: string; spend: number }> = [];
  for (let index = windowSize - 1; index < byMonth.length; index += 1) {
    const window = byMonth.slice(index - windowSize + 1, index + 1);
    const average = window.reduce((sum, month) => sum + month.spend, 0) / windowSize;
    values.push({
      period: byMonth[index].period,
      spend: round2(average)
    });
  }

  return values;
}

function detectMonthOutliers(byMonth: InsightsPeriodValue[]): InsightsMonthOutlier[] {
  if (byMonth.length < 4) {
    return [];
  }

  const spends = byMonth.map((month) => month.spend);
  const center = median(spends);
  const mad = median(spends.map((value) => Math.abs(value - center)));
  if (mad <= 0) {
    return [];
  }

  return byMonth
    .map((month) => {
      const score = (0.6745 * (month.spend - center)) / mad;
      return {
        period: month.period,
        spend: round2(month.spend),
        score: round2(score),
        severity: Math.abs(score) >= 6 ? ("strong" as const) : ("mild" as const)
      };
    })
    .filter((month) => Math.abs(month.score) >= 3.5)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
}

function detectOrderOutliers(orders: OrderSummary[]): InsightsOrderOutlier[] {
  const orderTotals = orders.filter((order) => order.orderTotal !== null && order.orderTotal > 0);
  if (orderTotals.length < 4) {
    return [];
  }

  const values = orderTotals.map((order) => order.orderTotal as number);
  const center = median(values);
  const mad = median(values.map((value) => Math.abs(value - center)));
  if (mad <= 0) {
    return [];
  }

  return orderTotals
    .map((order) => {
      const orderTotal = order.orderTotal as number;
      const score = (0.6745 * (orderTotal - center)) / mad;
      return {
        orderId: order.orderId,
        orderDate: order.orderDate,
        orderTotal: round2(orderTotal),
        score: round2(score),
        orderDetailUrl: order.orderDetailUrl
      };
    })
    .filter((order) => Math.abs(order.score) >= 3.5)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 10);
}

function getNextMonthPeriod(period: string): string {
  const [yearText, monthText] = period.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const date = new Date(Date.UTC(year, month - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + 1);
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

function confidenceFromMonthlySpend(byMonth: InsightsPeriodValue[]): ForecastConfidence {
  if (byMonth.length < 3) {
    return "low";
  }

  const values = byMonth.map((month) => month.spend);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 0) {
    return "low";
  }

  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;

  if (cv < 0.2) {
    return "high";
  }

  if (cv <= 0.45) {
    return "medium";
  }

  return "low";
}

function sortByPeriod(entries: Array<[string, PeriodAccumulator]>): Array<[string, PeriodAccumulator]> {
  return entries.sort(([left], [right]) => left.localeCompare(right));
}

function mapTopItemsByCount(entries: Map<string, ItemCountAccumulator>, topN: number): InsightsTopItemByCount[] {
  return Array.from(entries.entries())
    .map(([itemTitle, value]) => ({
      itemTitle,
      purchases: value.purchases,
      orderCount: value.orders.size
    }))
    .sort((a, b) => b.purchases - a.purchases || b.orderCount - a.orderCount || a.itemTitle.localeCompare(b.itemTitle))
    .slice(0, topN);
}

function mapTopItemsBySpend(entries: Map<string, ItemSpendAccumulator>, topN: number): InsightsTopItem[] {
  return Array.from(entries.entries())
    .map(([itemTitle, value]) => ({
      itemTitle,
      spend: round2(value.spend),
      purchases: value.purchases
    }))
    .sort((a, b) => b.spend - a.spend || b.purchases - a.purchases || a.itemTitle.localeCompare(b.itemTitle))
    .slice(0, topN);
}

function buildMonthDrilldowns(monthlyOrders: Map<string, OrderSummary[]>, sortedMonths: InsightsPeriodValue[]): InsightsMonthDrilldown[] {
  return sortedMonths.map((month) => {
    const orders = [...(monthlyOrders.get(month.period) ?? [])].sort((a, b) => b.orderSpend - a.orderSpend);

    const monthItemCounts = new Map<string, ItemCountAccumulator>();
    for (const order of orders) {
      for (const [title, purchases] of order.itemCounts.entries()) {
        const item = ensureItemCount(monthItemCounts, title);
        item.purchases += purchases;
        item.orders.add(order.orderId);
      }
    }

    return {
      period: month.period,
      spend: round2(month.spend),
      orderCount: month.orderCount,
      itemCount: month.itemCount,
      averageOrderValue: month.orderCount > 0 ? round2(month.spend / month.orderCount) : 0,
      topOrders: orders.slice(0, 10).map((order) => ({
        orderId: order.orderId,
        orderDate: order.orderDate,
        orderTotal: round2(order.orderSpend),
        itemCount: order.itemCount,
        itemTitles: order.itemTitles.slice(0, 5),
        orderDetailUrl: order.orderDetailUrl
      })),
      topItemsByCount: mapTopItemsByCount(monthItemCounts, 10)
    };
  });
}

function emptyPayload(): InsightsPayload {
  return {
    totals: {
      spend: 0,
      orderCount: 0,
      itemCount: 0
    },
    byYear: [],
    byMonth: [],
    topItems: [],
    valueProfile: {
      averageOrderValue: 0,
      medianOrderValue: 0,
      minOrderValueNonZero: 0,
      maxOrderValue: 0,
      p25OrderValue: 0,
      p75OrderValue: 0,
      p90OrderValue: 0
    },
    growth: {
      yoy: [],
      mom: [],
      rolling3: [],
      rolling6: []
    },
    outliers: {
      months: [],
      orders: []
    },
    costBreakdown: {
      shippingTotal: 0,
      taxTotal: 0,
      discountTotal: 0,
      estimatedMerchandiseTotal: 0,
      shippingPctOfSpend: 0,
      taxPctOfSpend: 0,
      discountPctOfSpend: 0
    },
    behavior: {
      avgOrdersPerMonth: 0,
      avgDaysBetweenOrders: null,
      longestGapDays: null,
      topWeekdayBySpend: null,
      topWeekdayByOrders: null
    },
    items: {
      topByCount: [],
      topBySpend: [],
      repeatItemRatePct: 0
    },
    concentration: {
      top1OrdersSharePct: 0,
      top5OrdersSharePct: 0,
      top10OrdersSharePct: 0,
      top5ItemsSpendSharePct: null
    },
    forecast: {
      annualizedRunRate90d: null,
      next3MonthsProjectedSpend: [],
      confidence: "low"
    },
    quality: {
      orderTotalCoveragePct: 0,
      itemSpendCoveragePct: 0,
      spendFromOrderLevelPct: 0,
      spendFromItemLevelPct: 0
    },
    monthDrilldowns: []
  };
}

export function aggregateInsights(rows: OrderItemRow[], topN = 10): InsightsPayload {
  if (rows.length === 0) {
    return emptyPayload();
  }

  const orders = new Map<string, OrderFact>();
  const globalItemCounts = new Map<string, ItemCountAccumulator>();
  const globalItemSpends = new Map<string, ItemSpendAccumulator>();

  let validRows = 0;
  let rowsWithItemSpend = 0;

  for (const row of rows) {
    if (!row.order_id || !row.order_date) {
      continue;
    }

    const timestamp = parseIsoDayToUtcMs(row.order_date);
    if (timestamp === null) {
      continue;
    }

    validRows += 1;

    const order = ensureOrder(orders, row, timestamp);
    if (!order.orderDetailUrl && row.order_detail_url?.trim()) {
      order.orderDetailUrl = row.order_detail_url;
    }

    const itemCount = getItemCount(row);
    const itemSpend = getItemSpend(row);
    order.itemCount += itemCount;
    order.itemSpend += itemSpend;
    if (itemSpend > 0) {
      rowsWithItemSpend += 1;
    }

    const orderTotal = getNonNegativeNumber(row.order_total);
    if (orderTotal !== null) {
      order.orderTotal = order.orderTotal === null ? orderTotal : Math.max(order.orderTotal, orderTotal);
    }

    const shipping = getNonNegativeNumber(row.shipping_amount);
    if (shipping !== null) {
      order.shippingAmount = order.shippingAmount === null ? shipping : Math.max(order.shippingAmount, shipping);
    }

    const tax = getNonNegativeNumber(row.tax_amount);
    if (tax !== null) {
      order.taxAmount = order.taxAmount === null ? tax : Math.max(order.taxAmount, tax);
    }

    const discount = getNonNegativeNumber(row.discount_amount);
    if (discount !== null) {
      order.discountAmount = order.discountAmount === null ? discount : Math.max(order.discountAmount, discount);
    }

    const title = nonPlaceholderTitle(row.item_title);
    if (!title) {
      continue;
    }

    order.itemTitles.set(title, true);
    const purchaseCount = itemCount > 0 ? itemCount : 1;
    order.itemCounts.set(title, (order.itemCounts.get(title) ?? 0) + purchaseCount);

    const countEntry = ensureItemCount(globalItemCounts, title);
    countEntry.purchases += purchaseCount;
    countEntry.orders.add(order.orderId);

    if (itemSpend > 0) {
      const spendEntry = ensureItemSpend(globalItemSpends, title);
      spendEntry.spend += itemSpend;
      spendEntry.purchases += purchaseCount;
    }
  }

  if (orders.size === 0) {
    return emptyPayload();
  }

  const orderSummaries: OrderSummary[] = [];
  const byYearMap = new Map<string, PeriodAccumulator>();
  const byMonthMap = new Map<string, PeriodAccumulator>();
  const monthlyOrders = new Map<string, OrderSummary[]>();
  const weekdaySpend = new Map<string, number>();
  const weekdayOrders = new Map<string, number>();

  let totalSpend = 0;
  let totalItemCount = 0;
  let orderLevelSpend = 0;
  let itemLevelSpend = 0;
  let ordersWithOrderTotal = 0;

  let shippingTotal = 0;
  let taxTotal = 0;
  let discountTotal = 0;
  let estimatedMerchandiseTotal = 0;

  for (const order of orders.values()) {
    let orderSpend = 0;
    let spendSource: SpendSource = "none";

    if (order.orderTotal !== null) {
      orderSpend = order.orderTotal;
      spendSource = "order_level";
      ordersWithOrderTotal += 1;
    } else if (order.itemSpend > 0) {
      orderSpend = order.itemSpend;
      spendSource = "item_level";
    }

    const shipping = order.shippingAmount ?? 0;
    const tax = order.taxAmount ?? 0;
    const discount = order.discountAmount ?? 0;

    shippingTotal += shipping;
    taxTotal += tax;
    discountTotal += discount;

    const estimatedMerchandise = Math.max(0, orderSpend - shipping - tax + discount);
    estimatedMerchandiseTotal += estimatedMerchandise;

    totalSpend += orderSpend;
    totalItemCount += order.itemCount;
    if (spendSource === "order_level") {
      orderLevelSpend += orderSpend;
    }
    if (spendSource === "item_level") {
      itemLevelSpend += orderSpend;
    }

    const yearKey = order.orderDate.slice(0, 4);
    const monthKey = order.orderDate.slice(0, 7);

    const year = ensurePeriod(byYearMap, yearKey);
    year.spend += orderSpend;
    year.itemCount += order.itemCount;
    year.orderCount += 1;

    const month = ensurePeriod(byMonthMap, monthKey);
    month.spend += orderSpend;
    month.itemCount += order.itemCount;
    month.orderCount += 1;

    const weekday = WEEKDAYS[new Date(order.timestamp).getUTCDay()];
    weekdaySpend.set(weekday, (weekdaySpend.get(weekday) ?? 0) + orderSpend);
    weekdayOrders.set(weekday, (weekdayOrders.get(weekday) ?? 0) + 1);

    const summary: OrderSummary = {
      orderId: order.orderId,
      orderDate: order.orderDate,
      timestamp: order.timestamp,
      orderDetailUrl: order.orderDetailUrl,
      orderSpend,
      spendSource,
      itemCount: order.itemCount,
      itemTitles: Array.from(order.itemTitles.keys()),
      itemCounts: order.itemCounts,
      orderTotal: order.orderTotal,
      shippingAmount: shipping,
      taxAmount: tax,
      discountAmount: discount
    };

    orderSummaries.push(summary);
    const monthOrders = monthlyOrders.get(monthKey) ?? [];
    monthOrders.push(summary);
    monthlyOrders.set(monthKey, monthOrders);

    if (spendSource === "order_level" && order.itemSpend <= 0 && order.itemTitles.size === 1 && orderSpend > 0) {
      const [title] = order.itemTitles.keys();
      const purchases = order.itemCounts.get(title) ?? 1;
      const spendEntry = ensureItemSpend(globalItemSpends, title);
      spendEntry.spend += orderSpend;
      spendEntry.purchases += purchases;
    }
  }

  const byYear = sortByPeriod(Array.from(byYearMap.entries())).map(([period, value]) => ({
    period,
    spend: round2(value.spend),
    orderCount: value.orderCount,
    itemCount: value.itemCount
  }));

  const byMonth = sortByPeriod(Array.from(byMonthMap.entries())).map(([period, value]) => ({
    period,
    spend: round2(value.spend),
    orderCount: value.orderCount,
    itemCount: value.itemCount
  }));

  const topByCount = mapTopItemsByCount(globalItemCounts, topN);
  const topBySpend = mapTopItemsBySpend(globalItemSpends, topN);

  const positiveOrderSpends = orderSummaries.map((order) => order.orderSpend).filter((value) => value > 0);
  const meanOrderValue = orders.size > 0 ? totalSpend / orders.size : 0;

  const minOrderValueNonZero = positiveOrderSpends.length > 0 ? Math.min(...positiveOrderSpends) : 0;
  const maxOrderValue = positiveOrderSpends.length > 0 ? Math.max(...positiveOrderSpends) : 0;

  const yoy = byYear.map((year, index) => {
    if (index === 0) {
      return {
        period: year.period,
        spend: year.spend,
        prevSpend: null,
        delta: null,
        deltaPct: null
      };
    }

    const previous = byYear[index - 1];
    const delta = year.spend - previous.spend;
    const deltaPct = previous.spend > 0 ? (delta / previous.spend) * 100 : null;

    return {
      period: year.period,
      spend: year.spend,
      prevSpend: previous.spend,
      delta: round2(delta),
      deltaPct: deltaPct === null ? null : round2(deltaPct)
    };
  });

  const mom = byMonth.map((month, index) => {
    if (index === 0) {
      return {
        period: month.period,
        spendDelta: null,
        spendDeltaPct: null,
        orderDelta: null,
        itemDelta: null
      };
    }

    const previous = byMonth[index - 1];
    const spendDelta = month.spend - previous.spend;
    const spendDeltaPct = previous.spend > 0 ? (spendDelta / previous.spend) * 100 : null;

    return {
      period: month.period,
      spendDelta: round2(spendDelta),
      spendDeltaPct: spendDeltaPct === null ? null : round2(spendDeltaPct),
      orderDelta: month.orderCount - previous.orderCount,
      itemDelta: month.itemCount - previous.itemCount
    };
  });

  const rolling3 = buildRollingSeries(byMonth, 3);
  const rolling6 = buildRollingSeries(byMonth, 6);

  const monthOutliers = detectMonthOutliers(byMonth);
  const orderOutliers = detectOrderOutliers(orderSummaries);

  const sortedOrdersBySpend = [...orderSummaries].sort((a, b) => b.orderSpend - a.orderSpend);
  const sumTopOrders = (count: number): number =>
    sortedOrdersBySpend.slice(0, count).reduce((sum, order) => sum + order.orderSpend, 0);

  const topItemSpendTotal = topBySpend.reduce((sum, item) => sum + item.spend, 0);
  const topFiveItemSpend = topBySpend.slice(0, 5).reduce((sum, item) => sum + item.spend, 0);

  const repeatTitles = topByCount.filter((item) => item.purchases > 1).length;
  const distinctTitles = topByCount.length > 0 ? globalItemCounts.size : 0;

  const sortedByDate = [...orderSummaries].sort((a, b) => a.timestamp - b.timestamp);
  const dayGaps: number[] = [];
  for (let i = 1; i < sortedByDate.length; i += 1) {
    const diff = Math.round((sortedByDate[i].timestamp - sortedByDate[i - 1].timestamp) / 86400000);
    if (diff >= 0) {
      dayGaps.push(diff);
    }
  }

  let annualizedRunRate90d: number | null = null;
  if (sortedByDate.length > 0) {
    const latestTimestamp = sortedByDate[sortedByDate.length - 1].timestamp;
    const windowStart = latestTimestamp - 89 * 86400000;
    const spendInLast90Days = sortedByDate
      .filter((order) => order.timestamp >= windowStart)
      .reduce((sum, order) => sum + order.orderSpend, 0);
    annualizedRunRate90d = round2((spendInLast90Days / 90) * 365);
  }

  const next3MonthsProjectedSpend: Array<{ period: string; projectedSpend: number }> = [];
  if (byMonth.length >= 3) {
    const trailingThreeMonths = byMonth.slice(-3);
    const projectedSpend = round2(trailingThreeMonths.reduce((sum, month) => sum + month.spend, 0) / 3);
    let period = byMonth[byMonth.length - 1].period;
    for (let index = 0; index < 3; index += 1) {
      period = getNextMonthPeriod(period);
      next3MonthsProjectedSpend.push({
        period,
        projectedSpend
      });
    }
  }

  const topWeekdayBySpendEntry = Array.from(weekdaySpend.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
  const topWeekdayByOrdersEntry = Array.from(weekdayOrders.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;

  const topMonth = [...byMonth].sort((a, b) => b.spend - a.spend)[0] ?? null;
  const monthDrilldowns = buildMonthDrilldowns(monthlyOrders, byMonth);

  return {
    totals: {
      spend: round2(totalSpend),
      orderCount: orders.size,
      itemCount: totalItemCount
    },
    byYear,
    byMonth,
    topItems: topBySpend,
    valueProfile: {
      averageOrderValue: round2(meanOrderValue),
      medianOrderValue: round2(median(positiveOrderSpends)),
      minOrderValueNonZero: round2(minOrderValueNonZero),
      maxOrderValue: round2(maxOrderValue),
      p25OrderValue: round2(percentile(positiveOrderSpends, 0.25)),
      p75OrderValue: round2(percentile(positiveOrderSpends, 0.75)),
      p90OrderValue: round2(percentile(positiveOrderSpends, 0.9))
    },
    growth: {
      yoy,
      mom,
      rolling3,
      rolling6
    },
    outliers: {
      months: monthOutliers,
      orders: orderOutliers
    },
    costBreakdown: {
      shippingTotal: round2(shippingTotal),
      taxTotal: round2(taxTotal),
      discountTotal: round2(discountTotal),
      estimatedMerchandiseTotal: round2(estimatedMerchandiseTotal),
      shippingPctOfSpend: pct(shippingTotal, totalSpend),
      taxPctOfSpend: pct(taxTotal, totalSpend),
      discountPctOfSpend: pct(discountTotal, totalSpend)
    },
    behavior: {
      avgOrdersPerMonth: byMonth.length > 0 ? round2(orders.size / byMonth.length) : 0,
      avgDaysBetweenOrders: dayGaps.length > 0 ? round2(dayGaps.reduce((sum, gap) => sum + gap, 0) / dayGaps.length) : null,
      longestGapDays: dayGaps.length > 0 ? Math.max(...dayGaps) : null,
      topWeekdayBySpend: topWeekdayBySpendEntry
        ? {
            weekday: topWeekdayBySpendEntry[0],
            spend: round2(topWeekdayBySpendEntry[1])
          }
        : null,
      topWeekdayByOrders: topWeekdayByOrdersEntry
        ? {
            weekday: topWeekdayByOrdersEntry[0],
            orders: topWeekdayByOrdersEntry[1]
          }
        : null
    },
    items: {
      topByCount,
      topBySpend,
      repeatItemRatePct: distinctTitles > 0 ? pct(repeatTitles, distinctTitles) : 0
    },
    concentration: {
      top1OrdersSharePct: pct(sumTopOrders(1), totalSpend),
      top5OrdersSharePct: pct(sumTopOrders(5), totalSpend),
      top10OrdersSharePct: pct(sumTopOrders(10), totalSpend),
      top5ItemsSpendSharePct: topItemSpendTotal > 0 && totalSpend > 0 ? pct(topFiveItemSpend, totalSpend) : null
    },
    forecast: {
      annualizedRunRate90d,
      next3MonthsProjectedSpend,
      confidence: confidenceFromMonthlySpend(byMonth)
    },
    quality: {
      orderTotalCoveragePct: pct(ordersWithOrderTotal, orders.size),
      itemSpendCoveragePct: pct(rowsWithItemSpend, validRows),
      spendFromOrderLevelPct: pct(orderLevelSpend, totalSpend),
      spendFromItemLevelPct: pct(itemLevelSpend, totalSpend)
    },
    monthDrilldowns
  };
}
