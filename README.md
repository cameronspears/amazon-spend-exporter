# Amazon Orders Local Exporter

A local-first tool that helps people audit Amazon spending by exporting item-level order history from `amazon.com` into CSV/XLSX and viewing insights in a browser dashboard.

## Why this exists
Amazon does not provide a straightforward self-service reporting workflow for personal order history. This project is built for:
- end-of-year spending review
- business expense review for purchases made on personal accounts
- year-over-year household spend visibility

## Key features
- Local web app UX (`npm run app`) for non-technical users
- Existing CLI export contract preserved
- Real browser workflow with manual login/2FA/CAPTCHA handling
- Item-level CSV + XLSX output
- Spend dashboard: totals, by-year, by-month, top items
- Warnings log for traceability when parsing is partial

## Privacy and security posture
- Runs locally on your machine
- Credentials are never stored by this app
- Login/CAPTCHA/checkpoint is manual in Amazon's own UI
- No telemetry, no cloud sync, no remote account storage

Read full details: [docs/PRIVACY-SECURITY.md](./docs/PRIVACY-SECURITY.md)

## Quickstart (5 minutes)
1. Install dependencies and browser runtime:

```bash
npm install
npx playwright install chromium
```

2. Start the app:

```bash
npm run app
```

3. Open `http://localhost:4173` and run an export.
4. Complete Amazon auth in the opened browser when prompted.
5. Download CSV/XLSX from the Results page.

## CLI usage (still supported)
```bash
node dist/cli.js export \
  --from 2024-01-01 \
  --to 2026-03-01 \
  --out ./exports \
  --format both \
  --headless false \
  --debug
```

### Exit codes
- `0` success
- `2` validation error
- `3` login/session incomplete
- `4` extraction failed or completed with warnings

## Web API (local)
- `POST /api/exports`
- `GET /api/exports/:runId`
- `GET /api/exports/:runId/events` (SSE)
- `GET /api/exports/:runId/warnings`
- `GET /api/exports/:runId/insights`
- `GET /api/exports/:runId/files/:name`
- `GET /api/health`

## Screenshots
- Export setup: ![Export setup](./docs/assets/export-setup.svg)
- Auth wait + progress: ![Auth wait](./docs/assets/auth-wait.svg)
- Results dashboard: ![Results dashboard](./docs/assets/results-dashboard.svg)

## Docs
- [Quickstart](./docs/QUICKSTART.md)
- [Privacy & Security](./docs/PRIVACY-SECURITY.md)
- [Troubleshooting](./docs/TROUBLESHOOTING.md)
- [FAQ](./docs/FAQ.md)
- [Limitations](./docs/LIMITATIONS.md)
- [Insights](./docs/INSIGHTS.md)
- [Release process](./docs/RELEASE.md)

## Project status
`v0.1.0` MVP. Amazon DOM changes can affect parsing; this is expected for UI automation tooling.

## License
MIT. See [LICENSE](./LICENSE).
