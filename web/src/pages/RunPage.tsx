import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchRun } from "../api";
import { StatusPill } from "../components/StatusPill";
import { ExportEvent, ExportRun, ExportRunStatus } from "../types";

const FINAL_STATUSES: ExportRunStatus[] = ["completed", "completed_with_warnings", "failed", "cancelled"];

function formatEventMessage(event: ExportEvent): string {
  return event.message.replace(/_/g, " ");
}

function formatTimestamp(value: string): string {
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return value;
  }
}

function nextStep(status: ExportRunStatus): string {
  if (status === "awaiting_auth") {
    return "Browser opened. Complete Amazon login, 2FA, and any CAPTCHA/checkpoint in that browser window.";
  }
  if (status === "collecting_orders") {
    return "The app is traversing year filters and order pages. Keep the browser window open.";
  }
  if (status === "extracting_details") {
    return "The app is opening each order detail page and normalizing item-level data.";
  }
  if (status === "writing_files") {
    return "Finalizing CSV/XLSX files and warnings summary.";
  }
  return "Monitoring run status.";
}

export function RunPage(): JSX.Element {
  const { runId = "" } = useParams();
  const [run, setRun] = useState<ExportRun | null>(null);
  const [events, setEvents] = useState<ExportEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let interval: number | null = null;

    const load = async (): Promise<void> => {
      try {
        const response = await fetchRun(runId);
        if (!isMounted) {
          return;
        }
        setRun(response);
        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    };

    load().catch(() => undefined);
    interval = window.setInterval(() => {
      load().catch(() => undefined);
    }, 2500);

    return () => {
      isMounted = false;
      if (interval !== null) {
        window.clearInterval(interval);
      }
    };
  }, [runId]);

  useEffect(() => {
    if (!runId) {
      return;
    }

    const source = new EventSource(`/api/exports/${encodeURIComponent(runId)}/events`);
    source.onmessage = (message) => {
      try {
        const payload = JSON.parse(message.data) as ExportEvent;
        setEvents((current) => {
          const dedup = current.some((item) => item.ts === payload.ts && item.message === payload.message);
          if (dedup) {
            return current;
          }
          const next = [...current, payload];
          return next.slice(Math.max(0, next.length - 120));
        });
      } catch {
        // no-op on malformed events
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, [runId]);

  const percent = run?.progress.percent ?? 0;
  const isDone = run ? FINAL_STATUSES.includes(run.status) : false;

  const latestEvents = useMemo(() => {
    return [...events].reverse();
  }, [events]);

  return (
    <main className="page page-run">
      <section className="panel reveal">
        <div className="panel-header">
          <h1>Export Run</h1>
          {run ? <StatusPill status={run.status} /> : null}
        </div>
        <p className="mono">Run ID: {runId}</p>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="progress-shell">
          <div className="progress-bar" style={{ width: `${percent}%` }} />
        </div>
        <p className="progress-label">{percent}% complete</p>

        {run ? (
          <div className="stats-grid">
            <article>
              <h2>Orders</h2>
              <p>
                {run.counts.ordersProcessed} / {run.counts.ordersTotal || "?"}
              </p>
            </article>
            <article>
              <h2>Items</h2>
              <p>{run.counts.itemsExtracted}</p>
            </article>
            <article>
              <h2>Warnings</h2>
              <p>{run.warningsCount}</p>
            </article>
          </div>
        ) : null}

        {run && isDone ? (
          <div className="actions-row">
            <Link className="button button-primary" to={`/results/${encodeURIComponent(run.runId)}`}>
              Open Results
            </Link>
          </div>
        ) : null}
      </section>

      <aside className="sticky-panel reveal reveal-delay-1">
        <h2>What to do now</h2>
        <p>{run ? nextStep(run.status) : "Fetching run state..."}</p>
      </aside>

      <section className="panel reveal reveal-delay-2">
        <h2>Live Event Log</h2>
        <div className="event-list">
          {latestEvents.length === 0 ? <p>No events yet.</p> : null}
          {latestEvents.map((event, index) => (
            <article key={`${event.ts}-${event.message}-${index}`} className="event-row">
              <span className="event-ts">{formatTimestamp(event.ts)}</span>
              <span className="event-message">{formatEventMessage(event)}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
