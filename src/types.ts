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

export interface InsightsPayload {
  totals: InsightsTotals;
  byYear: InsightsPeriodValue[];
  byMonth: InsightsPeriodValue[];
  topItems: InsightsTopItem[];
}

export interface Logger {
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
}
