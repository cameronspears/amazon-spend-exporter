# Insights Model (v0.2)

Insights are computed locally from exported item rows, then normalized to an order-first model.

## Reliability labels
- **Exact**: Directly observed from export fields (`order_total`, `order_count`, `quantity`, etc.).
- **Estimated**: Derived arithmetic from exact fields (for example merchandise base).
- **Projected**: Forward-looking values derived from historical trends.

## Spend source rules
1. Use `order_total` when present (exact order-level spend).
2. Fallback to item-level spend (`item_subtotal`, then `item_price * quantity`) only if `order_total` is missing.
3. Placeholder rows (`[Order captured; item details unavailable]`) count as orders, not item-level purchases.

## Core sections

## Totals (Exact)
- `spend`: total effective order spend.
- `orderCount`: unique order count.
- `itemCount`: sum of positive quantities.

## Value profile (Exact)
- `averageOrderValue`
- `medianOrderValue`
- `minOrderValueNonZero`
- `maxOrderValue`
- `p25OrderValue`, `p75OrderValue`, `p90OrderValue`

## Growth and trend (Exact)
- `byYear`, `byMonth`
- `growth.yoy`: year-over-year deltas and percentages.
- `growth.mom`: month-over-month deltas.
- `growth.rolling3`, `growth.rolling6`: rolling average spend.

## Outliers (Exact + Statistical)
- `outliers.months`: robust z-score outliers using median + MAD.
- `outliers.orders`: robust z-score order-total outliers.

Formula (when MAD > 0):
`score = 0.6745 * (value - median) / MAD`

Threshold:
- outlier when `|score| >= 3.5`
- severity `strong` when `|score| >= 6`, else `mild`

## Cost decomposition
- `shippingTotal`, `taxTotal`, `discountTotal` (Exact)
- `% of spend` fields (Estimated)
- `estimatedMerchandiseTotal` (Estimated):
`max(0, order_spend - shipping - tax + discount)`

## Behavior and cadence (Exact)
- `avgOrdersPerMonth`
- `avgDaysBetweenOrders`
- `longestGapDays`
- `topWeekdayBySpend`, `topWeekdayByOrders`

## Item intelligence
- `items.topByCount` (Exact quantity-based ranking)
- `items.topBySpend` (Exact where item-level spend is present, plus safe single-item fallback)
- `items.repeatItemRatePct`

## Concentration (Exact)
- `top1OrdersSharePct`
- `top5OrdersSharePct`
- `top10OrdersSharePct`
- `top5ItemsSpendSharePct` (nullable if item spend coverage is insufficient)

## Forecast and run-rate (Projected)
- `annualizedRunRate90d = (spend_last_90_days / 90) * 365`
- `next3MonthsProjectedSpend`: trailing 3-month average repeated for next 3 months.
- `confidence` based on monthly coefficient of variation (CV):
  - `high` if `CV < 0.20`
  - `medium` if `0.20 <= CV <= 0.45`
  - `low` otherwise

## Data quality (Exact metadata)
- `orderTotalCoveragePct`
- `itemSpendCoveragePct`
- `spendFromOrderLevelPct`
- `spendFromItemLevelPct`

## Month drilldowns
Each `monthDrilldowns[]` entry includes:
- summary (`spend`, `orderCount`, `itemCount`, `averageOrderValue`)
- `topOrders` with order IDs, totals, links, and item title preview
- `topItemsByCount`

## Compatibility note
`totals`, `byYear`, `byMonth`, and `topItems` remain available for backward compatibility with v0.1 consumers.
