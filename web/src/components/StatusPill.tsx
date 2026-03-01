import { ExportRunStatus } from "../types";

const LABELS: Record<ExportRunStatus, string> = {
  idle: "Queued",
  awaiting_auth: "Awaiting Auth",
  collecting_orders: "Collecting Orders",
  extracting_details: "Extracting Details",
  writing_files: "Writing Files",
  completed: "Completed",
  completed_with_warnings: "Completed w/ Warnings",
  failed: "Failed",
  cancelled: "Cancelled"
};

export function StatusPill({ status }: { status: ExportRunStatus }): JSX.Element {
  return <span className={`status-pill status-${status}`}>{LABELS[status]}</span>;
}
