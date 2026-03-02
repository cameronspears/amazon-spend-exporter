# Quickstart

This guide is for non-technical users.

## 1. Install once
You need Node.js 20+ and npm installed.

Run:

```bash
npm install
npx playwright install chromium
```

## 2. Start the app

```bash
npm start
```

Open: `http://localhost:4173`

## 3. Run your first export
1. Click **Start**.
2. Choose a date range.
3. Click **Start Export**.
4. In the opened browser, sign in to Amazon and complete any CAPTCHA/2FA.
5. Wait for completion.
6. Open **Results** to:
   - download CSV/XLSX
   - review spending insights

## 4. If the app cannot start
Try:

```bash
npm install
npm run build
npm start
```

If port `4173` is busy:

```bash
PORT=4180 npm start
```
