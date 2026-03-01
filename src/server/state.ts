import { randomUUID } from "node:crypto";
import { Response } from "express";
import { CliExportOptions } from "../config";
import { runExportJob } from "../core/run-export";
import { aggregateInsights } from "../insights/aggregate";
import { ExportEvent, ExportProgress, ExportRunStatus, InsightsPayload } from "../types";

interface SseClient {
  id: string;
  response: Response;
}

export interface StartExportRequest {
  from: string;
  to: string;
  outDir: string;
  format?: string;
  headless?: boolean | string;
  maxOrders?: number | string;
  maxRangeDays?: number | string;
  loginTimeoutSeconds?: number | string;
  debug?: boolean;
}

export interface ExportRunRecord {
  runId: string;
  status: ExportRunStatus;
  queued: boolean;
  request: StartExportRequest;
  createdAt: string;
  updatedAt: string;
  progress: ExportProgress;
  warnings: string[];
  files: string[];
  warningFile: string | null;
  warningsCount: number;
  errorMessage: string | null;
  events: ExportEvent[];
  insights: InsightsPayload | null;
}

const MAX_EVENT_HISTORY = 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function toCliOptions(input: StartExportRequest): CliExportOptions {
  return {
    from: input.from,
    to: input.to,
    out: input.outDir,
    format: input.format,
    headless: input.headless ?? false,
    maxOrders: input.maxOrders,
    maxRangeDays: input.maxRangeDays,
    loginTimeoutSeconds: input.loginTimeoutSeconds,
    debug: Boolean(input.debug)
  };
}

function createProgress(): ExportProgress {
  return {
    stage: "idle",
    percent: 0,
    ordersTotal: 0,
    ordersProcessed: 0,
    itemsExtracted: 0,
    warningsCount: 0
  };
}

export class ExportRunStore {
  private readonly runs = new Map<string, ExportRunRecord>();
  private readonly queue: string[] = [];
  private readonly sseClients = new Map<string, Map<string, SseClient>>();
  private activeRunId: string | null = null;

  enqueueExport(request: StartExportRequest): ExportRunRecord {
    const runId = randomUUID();
    const createdAt = nowIso();
    const record: ExportRunRecord = {
      runId,
      status: "idle",
      queued: this.activeRunId !== null,
      request,
      createdAt,
      updatedAt: createdAt,
      progress: createProgress(),
      warnings: [],
      files: [],
      warningFile: null,
      warningsCount: 0,
      errorMessage: null,
      events: [],
      insights: null
    };

    this.runs.set(runId, record);
    if (record.queued) {
      this.queue.push(runId);
      this.emitEvent(runId, {
        ts: nowIso(),
        stage: "idle",
        message: "queued_for_execution",
        progress: { ...record.progress }
      });
    } else {
      this.startRun(runId).catch((error) => {
        this.failRun(runId, error instanceof Error ? error.message : String(error));
      });
    }

    return record;
  }

  getRun(runId: string): ExportRunRecord | null {
    return this.runs.get(runId) ?? null;
  }

  getWarnings(runId: string): string[] | null {
    const run = this.runs.get(runId);
    return run ? [...run.warnings] : null;
  }

  getInsights(runId: string): InsightsPayload | null {
    return this.runs.get(runId)?.insights ?? null;
  }

  addSseClient(runId: string, response: Response): string | null {
    const run = this.runs.get(runId);
    if (!run) {
      return null;
    }

    const clientId = randomUUID();
    const clients = this.sseClients.get(runId) ?? new Map<string, SseClient>();
    clients.set(clientId, { id: clientId, response });
    this.sseClients.set(runId, clients);

    for (const event of run.events) {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    return clientId;
  }

  removeSseClient(runId: string, clientId: string): void {
    const clients = this.sseClients.get(runId);
    if (!clients) {
      return;
    }

    clients.delete(clientId);
    if (clients.size === 0) {
      this.sseClients.delete(runId);
    }
  }

  private async startRun(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) {
      return;
    }

    this.activeRunId = runId;
    run.queued = false;
    run.updatedAt = nowIso();

    const outcome = await runExportJob(toCliOptions(run.request), {
      onEvent: (event) => {
        const current = this.runs.get(runId);
        if (!current) {
          return;
        }
        current.status = event.stage;
        current.progress = event.progress;
        current.updatedAt = event.ts;
        current.warningsCount = event.progress.warningsCount;
        this.emitEvent(runId, event);
      }
    });

    const finished = this.runs.get(runId);
    if (!finished) {
      this.activeRunId = null;
      this.startNext();
      return;
    }

    finished.status = outcome.status;
    finished.updatedAt = nowIso();
    finished.warnings = outcome.warnings;
    finished.warningsCount = outcome.warnings.length;
    finished.files = outcome.files;
    finished.warningFile = outcome.warningFile;
    finished.errorMessage = outcome.errorMessage;
    finished.progress = {
      ...finished.progress,
      stage: outcome.status,
      percent: 100,
      ordersTotal: outcome.orders,
      ordersProcessed: outcome.orders,
      itemsExtracted: outcome.items,
      warningsCount: outcome.warnings.length
    };
    finished.insights = aggregateInsights(outcome.rows);

    this.emitEvent(runId, {
      ts: nowIso(),
      stage: outcome.status,
      message: "run_finalized",
      progress: { ...finished.progress },
      context: {
        files: outcome.files,
        warnings: outcome.warnings.length
      }
    });

    this.activeRunId = null;
    this.startNext();
  }

  private failRun(runId: string, message: string): void {
    const run = this.runs.get(runId);
    if (!run) {
      this.activeRunId = null;
      this.startNext();
      return;
    }

    run.status = "failed";
    run.errorMessage = message;
    run.updatedAt = nowIso();
    run.progress = {
      ...run.progress,
      stage: "failed",
      percent: 100
    };

    this.emitEvent(runId, {
      ts: run.updatedAt,
      stage: "failed",
      message: "run_failed",
      progress: { ...run.progress },
      context: {
        error: message
      }
    });
    this.activeRunId = null;
    this.startNext();
  }

  private startNext(): void {
    if (this.activeRunId !== null) {
      return;
    }

    const nextId = this.queue.shift();
    if (!nextId) {
      return;
    }

    this.startRun(nextId).catch((error) => {
      this.failRun(nextId, error instanceof Error ? error.message : String(error));
    });
  }

  private emitEvent(runId: string, event: ExportEvent): void {
    const run = this.runs.get(runId);
    if (!run) {
      return;
    }

    run.events.push(event);
    if (run.events.length > MAX_EVENT_HISTORY) {
      run.events.splice(0, run.events.length - MAX_EVENT_HISTORY);
    }

    const clients = this.sseClients.get(runId);
    if (!clients) {
      return;
    }

    for (const client of clients.values()) {
      client.response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }
}
