import fs from "node:fs";
import path from "node:path";
import express from "express";
import { createLogger } from "../logger";
import { registerExportRoutes } from "./routes/exports";
import { registerHealthRoutes } from "./routes/health";
import { ExportRunStore } from "./state";

const DEFAULT_PORT = 4173;

function resolveWebDistDir(): string {
  return path.resolve(process.cwd(), "web/dist");
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

async function startServer(): Promise<void> {
  const logger = createLogger();
  const app = express();
  const store = new ExportRunStore();
  const port = Number(process.env.PORT ?? DEFAULT_PORT);

  app.use(express.json({ limit: "1mb" }));
  registerHealthRoutes(app);
  registerExportRoutes(app, store);

  const webDistDir = resolveWebDistDir();
  const indexPath = path.join(webDistDir, "index.html");
  if (fileExists(indexPath)) {
    app.use(express.static(webDistDir));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(indexPath);
    });
  } else {
    app.get("/", (_req, res) => {
      res
        .status(503)
        .send(
          "Web assets not found. Run `npm run web:build` (or `npm run build`) and restart `npm run app`."
        );
    });
  }

  app.listen(port, () => {
    logger.info("server_started", {
      port,
      baseUrl: `http://localhost:${port}`,
      webAssets: fileExists(indexPath) ? indexPath : "missing"
    });
  });
}

startServer().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
