import { Link } from "react-router-dom";

export function LandingPage(): JSX.Element {
  return (
    <main className="page page-landing">
      <section className="hero-card reveal">
        <p className="eyebrow">Amazon Orders Local Exporter</p>
        <h1>Clear spending insights from your own Amazon history.</h1>
        <p>
          Export item-level CSV/XLSX reports and view spend trends year-over-year without sharing your account
          credentials with any cloud service.
        </p>
        <div className="hero-actions">
          <Link to="/export" className="button button-primary">
            Start Export
          </Link>
          <Link to="/results/demo" className="button button-ghost">
            View UX Preview
          </Link>
        </div>
      </section>

      <section className="trust-grid reveal reveal-delay-1">
        <article className="trust-card">
          <h2>Runs locally on your machine</h2>
          <p>Your browser session and export files stay on your computer.</p>
        </article>
        <article className="trust-card">
          <h2>Credentials are never stored</h2>
          <p>The app does not persist passwords, cookies, or payment secrets.</p>
        </article>
        <article className="trust-card">
          <h2>Manual login and CAPTCHA only</h2>
          <p>You complete Amazon auth, 2FA, and checkpoints directly in the opened browser.</p>
        </article>
      </section>

      <section className="problem-card reveal reveal-delay-2">
        <h2>Why this exists</h2>
        <p>
          Amazon does not provide straightforward, self-service audit exports for personal order history. This tool
          helps people review business purchases made from personal accounts and understand year-over-year spending.
        </p>
      </section>
    </main>
  );
}
