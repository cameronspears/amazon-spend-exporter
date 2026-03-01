import { InsightsPayload, OrderItemRow } from "../types";

const PLACEHOLDER_TITLE = "[Order captured; item details unavailable]";

interface MutablePeriodValue {
  spend: number;
  itemCount: number;
  orders: Set<string>;
}

function toMoney(value: number): number {
  return Math.round(value * 100) / 100;
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

function ensurePeriod(map: Map<string, MutablePeriodValue>, key: string): MutablePeriodValue {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const created: MutablePeriodValue = {
    spend: 0,
    itemCount: 0,
    orders: new Set<string>()
  };
  map.set(key, created);
  return created;
}

export function aggregateInsights(rows: OrderItemRow[], topN = 10): InsightsPayload {
  const byYear = new Map<string, MutablePeriodValue>();
  const byMonth = new Map<string, MutablePeriodValue>();
  const allOrders = new Set<string>();
  const topItems = new Map<string, { spend: number; purchases: number }>();

  let spend = 0;
  let itemCount = 0;

  for (const row of rows) {
    if (!row.order_id || !row.order_date || !/^\d{4}-\d{2}-\d{2}$/.test(row.order_date)) {
      continue;
    }

    allOrders.add(row.order_id);

    const rowSpend = getItemSpend(row);
    const rowItemCount = getItemCount(row);
    spend += rowSpend;
    itemCount += rowItemCount;

    const yearKey = row.order_date.slice(0, 4);
    const monthKey = row.order_date.slice(0, 7);

    const yearBucket = ensurePeriod(byYear, yearKey);
    yearBucket.spend += rowSpend;
    yearBucket.itemCount += rowItemCount;
    yearBucket.orders.add(row.order_id);

    const monthBucket = ensurePeriod(byMonth, monthKey);
    monthBucket.spend += rowSpend;
    monthBucket.itemCount += rowItemCount;
    monthBucket.orders.add(row.order_id);

    if (row.item_title && row.item_title !== PLACEHOLDER_TITLE) {
      const item = topItems.get(row.item_title) ?? { spend: 0, purchases: 0 };
      item.spend += rowSpend;
      item.purchases += rowItemCount > 0 ? rowItemCount : 1;
      topItems.set(row.item_title, item);
    }
  }

  return {
    totals: {
      spend: toMoney(spend),
      orderCount: allOrders.size,
      itemCount
    },
    byYear: Array.from(byYear.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, value]) => ({
        period,
        spend: toMoney(value.spend),
        orderCount: value.orders.size,
        itemCount: value.itemCount
      })),
    byMonth: Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, value]) => ({
        period,
        spend: toMoney(value.spend),
        orderCount: value.orders.size,
        itemCount: value.itemCount
      })),
    topItems: Array.from(topItems.entries())
      .map(([itemTitle, value]) => ({
        itemTitle,
        spend: toMoney(value.spend),
        purchases: value.purchases
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, topN)
  };
}
