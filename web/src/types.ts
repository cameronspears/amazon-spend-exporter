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

export interface ExportFile {
  name: string;
  path: string;
}

export interface ExportRun {
  runId: string;
  status: ExportRunStatus;
  queued: boolean;
  progress: ExportProgress;
  counts: {
    ordersTotal: number;
    ordersProcessed: number;
    itemsExtracted: number;
  };
  warningsCount: number;
  files: ExportFile[];
  warningFile: ExportFile | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
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
  totals: {
    spend: number;
    orderCount: number;
    itemCount: number;
  };
  byYear: InsightsPeriodValue[];
  byMonth: InsightsPeriodValue[];
  topItems: InsightsTopItem[];
}

export interface CreateExportRequest {
  from: string;
  to: string;
  outDir: string;
  format: "csv" | "xlsx" | "both";
  headless: boolean;
  maxOrders?: number;
  debug: boolean;
}
