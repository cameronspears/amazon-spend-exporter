import path from "node:path";
import { Express, Request, Response } from "express";
import { ExportRunStore, StartExportRequest } from "../state";

function mapRunForResponse(run: ReturnType<ExportRunStore["getRun"]>) {
  if (!run) {
    return null;
  }

  const fileDescriptors = run.files.map((file) => ({
    name: path.basename(file),
    path: file
  }));

  const warningFile = run.warningFile
    ? {
        name: path.basename(run.warningFile),
        path: run.warningFile
      }
    : null;

  return {
    runId: run.runId,
    status: run.status,
    queued: run.queued,
    progress: run.progress,
    counts: {
      ordersTotal: run.progress.ordersTotal,
      ordersProcessed: run.progress.ordersProcessed,
      itemsExtracted: run.progress.itemsExtracted
    },
    warningsCount: run.warningsCount,
    files: fileDescriptors,
    warningFile,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt
  };
}

function parseRequestBody(request: Request): StartExportRequest {
  const body = (request.body ?? {}) as Partial<StartExportRequest>;
  return {
    from: String(body.from ?? ""),
    to: String(body.to ?? ""),
    outDir: String(body.outDir ?? ""),
    format: body.format,
    headless: body.headless,
    maxOrders: body.maxOrders,
    maxRangeDays: body.maxRangeDays,
    loginTimeoutSeconds: body.loginTimeoutSeconds,
    debug: Boolean(body.debug)
  };
}

function validateStartExportRequest(body: StartExportRequest): string | null {
  if (!body.from || !body.to || !body.outDir) {
    return "from, to, and outDir are required.";
  }
  return null;
}

function setupSse(response: Response): void {
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();
}

export function registerExportRoutes(app: Express, store: ExportRunStore): void {
  app.post("/api/exports", (req, res) => {
    const body = parseRequestBody(req);
    const validationError = validateStartExportRequest(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const run = store.enqueueExport(body);
    res.status(202).json({
      runId: run.runId,
      queued: run.queued
    });
  });

  app.get("/api/exports/:runId", (req, res) => {
    const run = store.getRun(req.params.runId);
    if (!run) {
      res.status(404).json({ error: "Run not found." });
      return;
    }

    res.json(mapRunForResponse(run));
  });

  app.get("/api/exports/:runId/events", (req, res) => {
    const runId = req.params.runId;
    setupSse(res);
    const clientId = store.addSseClient(runId, res);
    if (!clientId) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Run not found." })}\n\n`);
      res.end();
      return;
    }

    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      store.removeSseClient(runId, clientId);
      res.end();
    });
  });

  app.get("/api/exports/:runId/warnings", (req, res) => {
    const warnings = store.getWarnings(req.params.runId);
    if (!warnings) {
      res.status(404).json({ error: "Run not found." });
      return;
    }

    res.json({ warnings });
  });

  app.get("/api/exports/:runId/insights", (req, res) => {
    const run = store.getRun(req.params.runId);
    if (!run) {
      res.status(404).json({ error: "Run not found." });
      return;
    }

    if (!run.insights) {
      res.status(409).json({ error: "Insights are not available until the run is complete." });
      return;
    }

    res.json(run.insights);
  });

  app.get("/api/exports/:runId/files/:name", (req, res) => {
    const run = store.getRun(req.params.runId);
    if (!run) {
      res.status(404).json({ error: "Run not found." });
      return;
    }

    const name = req.params.name;
    const candidates = [...run.files, ...(run.warningFile ? [run.warningFile] : [])];
    const matched = candidates.find((file) => path.basename(file) === name);
    if (!matched) {
      res.status(404).json({ error: "File not found for run." });
      return;
    }

    res.sendFile(path.resolve(matched));
  });
}
