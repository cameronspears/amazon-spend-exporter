export type ExportFormat = "csv" | "xlsx" | "both";
export type ExportRunStatus =
  | "idle"
  | "awaiting_auth"
  | "collecting_orders"
  | "extracting_details"
  | "writing_files"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "cancelled";

export interface OrderRef {
  orderId: string;
  orderDate: string;
  detailUrl: string;
}

export interface ParsedOrderItem {
  itemTitle: string;
  asinOrSku: string | null;
  quantity: number;
  itemPrice: number | null;
  itemSubtotal: number | null;
}

export interface OrderDetailParseResult {
  orderId: string | null;
  orderDate: string | null;
  orderStatus: string | null;
  paymentMethodMasked: string | null;
  shipToCity: string | null;
  shipToState: string | null;
  shipToCountry: string | null;
  shippingAmount: number | null;
  taxAmount: number | null;
  discountAmount: number | null;
  orderTotal: number | null;
  currency: string | null;
  invoiceUrl: string | null;
  items: ParsedOrderItem[];
  warnings: string[];
}

export interface OrderItemRow {
  order_id: string;
  order_date: string;
  order_status: string | null;
  item_title: string;
  asin_or_sku: string | null;
  quantity: number;
  item_price: number | null;
  item_subtotal: number | null;
  shipping_amount: number | null;
  tax_amount: number | null;
  discount_amount: number | null;
  order_total: number | null;
  payment_method_masked: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_country: string | null;
  invoice_url: string | null;
  order_detail_url: string;
  currency: string | null;
  source_marketplace: "amazon.com";
  exported_at: string;
}

export interface ExportRunMeta {
  from: string;
  to: string;
  generatedAt: string;
  totalOrders: number;
  totalItems: number;
  warnings: string[];
}

export interface ExportProgress {
  stage: ExportRunStatus;
  percent: number;
  ordersTotal: number;
  ordersProcessed: number;
  itemsExtracted: number;
  warningsCount: number;
}

export interface ExportEvent {
  ts: string;
  stage: ExportRunStatus;
  message: string;
  progress: ExportProgress;
  context?: Record<string, unknown>;
}

export interface InsightsTotals {
  spend: number;
  orderCount: number;
  itemCount: number;
}

export interface InsightsPeriodValue {
  period: string;
  spend: number;
  orderCount: number;
  itemCount: number;
}

export interface InsightsTopItem {
  itemTitle: string;
  spend: number;
  purchases: number;
}

export interface InsightsTopItemByCount {
  itemTitle: string;
  purchases: number;
  orderCount: number;
}

export interface InsightsValueProfile {
  averageOrderValue: number;
  medianOrderValue: number;
  minOrderValueNonZero: number;
  maxOrderValue: number;
  p25OrderValue: number;
  p75OrderValue: number;
  p90OrderValue: number;
}

export interface InsightsYearOverYear {
  period: string;
  spend: number;
  prevSpend: number | null;
  delta: number | null;
  deltaPct: number | null;
}

export interface InsightsMonthOverMonth {
  period: string;
  spendDelta: number | null;
  spendDeltaPct: number | null;
  orderDelta: number | null;
  itemDelta: number | null;
}

export interface InsightsPeriodSpend {
  period: string;
  spend: number;
}

export interface InsightsGrowth {
  yoy: InsightsYearOverYear[];
  mom: InsightsMonthOverMonth[];
  rolling3: InsightsPeriodSpend[];
  rolling6: InsightsPeriodSpend[];
}

export type InsightsOutlierSeverity = "mild" | "strong";

export interface InsightsMonthOutlier {
  period: string;
  spend: number;
  score: number;
  severity: InsightsOutlierSeverity;
}

export interface InsightsOrderOutlier {
  orderId: string;
  orderDate: string;
  orderTotal: number;
  score: number;
  orderDetailUrl: string | null;
}

export interface InsightsOutliers {
  months: InsightsMonthOutlier[];
  orders: InsightsOrderOutlier[];
}

export interface InsightsCostBreakdown {
  shippingTotal: number;
  taxTotal: number;
  discountTotal: number;
  estimatedMerchandiseTotal: number;
  shippingPctOfSpend: number;
  taxPctOfSpend: number;
  discountPctOfSpend: number;
}

export interface InsightsBehavior {
  avgOrdersPerMonth: number;
  avgDaysBetweenOrders: number | null;
  longestGapDays: number | null;
  topWeekdayBySpend: { weekday: string; spend: number } | null;
  topWeekdayByOrders: { weekday: string; orders: number } | null;
}

export interface InsightsItems {
  topByCount: InsightsTopItemByCount[];
  topBySpend: InsightsTopItem[];
  repeatItemRatePct: number;
}

export interface InsightsConcentration {
  top1OrdersSharePct: number;
  top5OrdersSharePct: number;
  top10OrdersSharePct: number;
  top5ItemsSpendSharePct: number | null;
}

export type ForecastConfidence = "low" | "medium" | "high";

export interface InsightsForecast {
  annualizedRunRate90d: number | null;
  next3MonthsProjectedSpend: Array<{ period: string; projectedSpend: number }>;
  confidence: ForecastConfidence;
}

export interface InsightsQuality {
  orderTotalCoveragePct: number;
  itemSpendCoveragePct: number;
  spendFromOrderLevelPct: number;
  spendFromItemLevelPct: number;
}

export interface InsightsOrderDrilldownRow {
  orderId: string;
  orderDate: string;
  orderTotal: number;
  itemCount: number;
  itemTitles: string[];
  orderDetailUrl: string | null;
}

export interface InsightsMonthDrilldown {
  period: string;
  spend: number;
  orderCount: number;
  itemCount: number;
  averageOrderValue: number;
  topOrders: InsightsOrderDrilldownRow[];
  topItemsByCount: InsightsTopItemByCount[];
}

export interface InsightsPayload {
  totals: InsightsTotals;
  byYear: InsightsPeriodValue[];
  byMonth: InsightsPeriodValue[];
  topItems: InsightsTopItem[];
  valueProfile: InsightsValueProfile;
  growth: InsightsGrowth;
  outliers: InsightsOutliers;
  costBreakdown: InsightsCostBreakdown;
  behavior: InsightsBehavior;
  items: InsightsItems;
  concentration: InsightsConcentration;
  forecast: InsightsForecast;
  quality: InsightsQuality;
  monthDrilldowns: InsightsMonthDrilldown[];
}

export interface Logger {
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
}
