import { CreateExportRequest, ExportRun, InsightsPayload } from "./types";

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const fallback = `Request failed with ${response.status}`;
    let parsedError: string | null = null;
    try {
      const payload = (await response.json()) as { error?: string };
      parsedError = payload.error ?? null;
    } catch {
      // Ignore non-json responses.
    }
    throw new Error(parsedError ?? fallback);
  }

  return (await response.json()) as T;
}

export async function createExportRun(input: CreateExportRequest): Promise<{ runId: string; queued: boolean }> {
  const response = await fetch("/api/exports", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  return parseJson<{ runId: string; queued: boolean }>(response);
}

export async function fetchRun(runId: string): Promise<ExportRun> {
  const response = await fetch(`/api/exports/${encodeURIComponent(runId)}`);
  return parseJson<ExportRun>(response);
}

export async function fetchWarnings(runId: string): Promise<string[]> {
  const response = await fetch(`/api/exports/${encodeURIComponent(runId)}/warnings`);
  const payload = await parseJson<{ warnings: string[] }>(response);
  return payload.warnings;
}

export async function fetchInsights(runId: string): Promise<InsightsPayload> {
  const response = await fetch(`/api/exports/${encodeURIComponent(runId)}/insights`);
  return parseJson<InsightsPayload>(response);
}

export function buildDownloadUrl(runId: string, filename: string): string {
  return `/api/exports/${encodeURIComponent(runId)}/files/${encodeURIComponent(filename)}`;
}
