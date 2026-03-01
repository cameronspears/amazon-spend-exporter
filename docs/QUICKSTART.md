# Quickstart

## Requirements
- Node.js >= 20
- npm

## Setup
```bash
npm install
npx playwright install chromium
```

## Launch app
```bash
npm run app
```

Open: `http://localhost:4173`

## Run first export
1. Go to **Export**.
2. Set date range and output directory.
3. Click **Open Browser and Export**.
4. Complete Amazon login/2FA/CAPTCHA manually in the opened browser.
5. Wait for run completion and open **Results**.
6. Download CSV/XLSX.

## CLI fallback
```bash
npm run build
node dist/cli.js export --from 2025-01-01 --to 2025-12-31 --out ./exports --format both --headless false
```
