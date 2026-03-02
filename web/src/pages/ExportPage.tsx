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
  const [format, setFormat] = useState<ExportFormat>("both");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasBasicValidationError = useMemo(() => {
    return !from || !to || from > to;
  }, [from, to]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);

    if (hasBasicValidationError) {
      setError("Choose a valid date range before starting.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await createExportRun({
        from,
        to,
        format,
        outDir: "./exports",
        debug: false
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
        <h1>Start</h1>
        <p>
          Pick your date range, click <strong>Start Export</strong>, then complete Amazon login in the browser
          window that opens.
        </p>

        <div className="step-grid">
          <article className="step-card">
            <h2>Step 1</h2>
            <p>Select dates for the report window.</p>
          </article>
          <article className="step-card">
            <h2>Step 2</h2>
            <p>Click Start Export to open Amazon auth.</p>
          </article>
          <article className="step-card">
            <h2>Step 3</h2>
            <p>Finish login/CAPTCHA in browser. The run continues automatically.</p>
          </article>
        </div>

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
            <span>File format</span>
            <select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
              <option value="both">CSV + XLSX (recommended)</option>
              <option value="csv">CSV only</option>
              <option value="xlsx">XLSX only</option>
            </select>
          </label>

          {error ? <p className="error-text field-wide">{error}</p> : null}

          <div className="actions-row field-wide">
            <button className="button button-primary" type="submit" disabled={isSubmitting || hasBasicValidationError}>
              {isSubmitting ? "Starting..." : "Start Export"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
