import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createExportRun } from "../api";

type ExportFormat = "csv" | "xlsx" | "both";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstDayTwoYearsAgo(): string {
  const now = new Date();
  return `${now.getFullYear() - 2}-01-01`;
}

export function ExportPage(): JSX.Element {
  const navigate = useNavigate();
  const [from, setFrom] = useState(firstDayTwoYearsAgo);
  const [to, setTo] = useState(todayIso);
  const [outDir, setOutDir] = useState("./exports");
  const [format, setFormat] = useState<ExportFormat>("both");
  const [headless, setHeadless] = useState(false);
  const [maxOrders, setMaxOrders] = useState("5000");
  const [debug, setDebug] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasBasicValidationError = useMemo(() => {
    return !from || !to || !outDir || from > to;
  }, [from, to, outDir]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);

    if (hasBasicValidationError) {
      setError("Please provide a valid date range and output directory.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await createExportRun({
        from,
        to,
        outDir,
        format,
        headless,
        maxOrders: Number(maxOrders),
        debug
      });
      navigate(`/run/${encodeURIComponent(response.runId)}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page">
      <section className="panel reveal">
        <h1>Start Export</h1>
        <p>
          Configure your range and output format. When the run starts, a browser opens for manual Amazon login.
        </p>

        <form className="form-grid" onSubmit={onSubmit}>
          <label>
            <span>From</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required />
          </label>

          <label>
            <span>To</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} required />
          </label>

          <label className="field-wide">
            <span>Output Directory</span>
            <input value={outDir} onChange={(event) => setOutDir(event.target.value)} required />
          </label>

          <label>
            <span>Format</span>
            <select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
              <option value="both">CSV + XLSX</option>
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX</option>
            </select>
          </label>

          <label>
            <span>Max Orders</span>
            <input
              type="number"
              min={1}
              value={maxOrders}
              onChange={(event) => setMaxOrders(event.target.value)}
            />
          </label>

          <label className="toggle">
            <input type="checkbox" checked={headless} onChange={(event) => setHeadless(event.target.checked)} />
            <span>Run headless browser</span>
          </label>

          <label className="toggle">
            <input type="checkbox" checked={debug} onChange={(event) => setDebug(event.target.checked)} />
            <span>Write debug snapshots for parser issues</span>
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="actions-row field-wide">
            <button className="button button-primary" type="submit" disabled={isSubmitting || hasBasicValidationError}>
              {isSubmitting ? "Starting..." : "Open Browser and Export"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
