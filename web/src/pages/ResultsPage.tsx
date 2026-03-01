import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { buildDownloadUrl, fetchInsights, fetchRun, fetchWarnings } from "../api";
import { StatusPill } from "../components/StatusPill";
import { ExportRun, InsightsPayload } from "../types";

const DEMO_INSIGHTS: InsightsPayload = {
  totals: {
    spend: 4821.9,
    orderCount: 209,
    itemCount: 341
  },
  byYear: [
    { period: "2024", spend: 1980.2, orderCount: 74, itemCount: 122 },
    { period: "2025", spend: 2230.1, orderCount: 115, itemCount: 171 },
    { period: "2026", spend: 611.6, orderCount: 20, itemCount: 48 }
  ],
  byMonth: [
    { period: "2025-10", spend: 180.3, orderCount: 11, itemCount: 15 },
    { period: "2025-11", spend: 270.7, orderCount: 14, itemCount: 22 },
    { period: "2025-12", spend: 420.1, orderCount: 20, itemCount: 28 },
    { period: "2026-01", spend: 352.4, orderCount: 12, itemCount: 17 },
    { period: "2026-02", spend: 259.2, orderCount: 8, itemCount: 13 }
  ],
  topItems: [
    { itemTitle: "Office Paper", spend: 310.8, purchases: 20 },
    { itemTitle: "Dog Food", spend: 298.3, purchases: 8 },
    { itemTitle: "Camera Strap", spend: 190.2, purchases: 3 }
  ]
};

function toMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function interpretInsights(insights: InsightsPayload): string {
  if (insights.byYear.length < 2) {
    return "You now have a clear baseline for Amazon spend in the selected range.";
  }

  const previous = insights.byYear[insights.byYear.length - 2];
  const current = insights.byYear[insights.byYear.length - 1];
  const delta = current.spend - previous.spend;
  const direction = delta >= 0 ? "up" : "down";
  return `${current.period} is ${direction} ${toMoney(Math.abs(delta))} vs ${previous.period}.`;
}

export function ResultsPage(): JSX.Element {
  const { runId = "" } = useParams();
  const [run, setRun] = useState<ExportRun | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [insights, setInsights] = useState<InsightsPayload | null>(runId === "demo" ? DEMO_INSIGHTS : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId || runId === "demo") {
      return;
    }

    let isMounted = true;

    const load = async (): Promise<void> => {
      try {
        const [runResponse, warningResponse, insightResponse] = await Promise.all([
          fetchRun(runId),
          fetchWarnings(runId),
          fetchInsights(runId)
        ]);

        if (!isMounted) {
          return;
        }

        setRun(runResponse);
        setWarnings(warningResponse);
        setInsights(insightResponse);
        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    };

    load().catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [runId]);

  const monthSeries = useMemo(() => {
    if (!insights) {
      return [];
    }

    const data = insights.byMonth.slice(-12);
    const maxSpend = data.reduce((max, item) => Math.max(max, item.spend), 0) || 1;
    return data.map((item) => ({
      ...item,
      width: `${Math.max(8, Math.round((item.spend / maxSpend) * 100))}%`
    }));
  }, [insights]);

  return (
    <main className="page">
      <section className="panel reveal">
        <div className="panel-header">
          <h1>Results</h1>
          {run ? <StatusPill status={run.status} /> : null}
        </div>
        {error ? <p className="error-text">{error}</p> : null}

        {runId === "demo" ? <p>Demo view of the post-export experience.</p> : null}

        {run ? (
          <div className="download-grid">
            {run.files.map((file) => (
              <a key={file.name} className="button button-primary" href={buildDownloadUrl(run.runId, file.name)}>
                Download {file.name}
              </a>
            ))}
            {run.warningFile ? (
              <a className="button button-ghost" href={buildDownloadUrl(run.runId, run.warningFile.name)}>
                Download Warnings Log
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      {insights ? (
        <section className="panel reveal reveal-delay-1">
          <h2>Spend Dashboard</h2>
          <div className="stats-grid">
            <article>
              <h3>Total Spend</h3>
              <p>{toMoney(insights.totals.spend)}</p>
            </article>
            <article>
              <h3>Orders</h3>
              <p>{insights.totals.orderCount}</p>
            </article>
            <article>
              <h3>Items</h3>
              <p>{insights.totals.itemCount}</p>
            </article>
          </div>
          <p className="insight-callout">{interpretInsights(insights)}</p>

          <div className="chart-shell">
            <h3>Monthly Spend Trend</h3>
            <div className="bar-list">
              {monthSeries.map((item) => (
                <div className="bar-row" key={item.period}>
                  <span>{item.period}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: item.width }} />
                  </div>
                  <strong>{toMoney(item.spend)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="table-shell">
            <h3>Top Purchased Items</h3>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Spend</th>
                  <th>Purchases</th>
                </tr>
              </thead>
              <tbody>
                {insights.topItems.map((item) => (
                  <tr key={item.itemTitle}>
                    <td>{item.itemTitle}</td>
                    <td>{toMoney(item.spend)}</td>
                    <td>{item.purchases}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="panel reveal reveal-delay-2">
        <h2>Warnings Summary</h2>
        {warnings.length === 0 ? <p>No warnings in this run.</p> : null}
        <ul className="warning-list">
          {warnings.slice(0, 30).map((warning, index) => (
            <li key={`${warning}-${index}`}>{warning}</li>
          ))}
        </ul>
        {warnings.length > 30 ? <p>Showing first 30 warnings. Download the full warnings log for all entries.</p> : null}
      </section>

      <div className="actions-row">
        <Link to="/export" className="button button-ghost">
          Start Another Export
        </Link>
      </div>
    </main>
  );
}
