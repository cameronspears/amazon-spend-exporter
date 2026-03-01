# Insights Model

Insights are computed from exported item-level rows.

## Totals
- `spend`: sum of item spend
- `orderCount`: unique `order_id`
- `itemCount`: sum of positive `quantity`

## Spend rules
1. Use `item_subtotal` when present.
2. Fallback to `item_price * quantity`.
3. Placeholder rows (`[Order captured; item details unavailable]`) count as orders but not spend.

## Time series
- `byYear`: grouped by `YYYY`
- `byMonth`: grouped by `YYYY-MM`

## Top items
Grouped by exact `item_title`, sorted by spend descending.
