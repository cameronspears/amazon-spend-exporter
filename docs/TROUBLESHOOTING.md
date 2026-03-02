# Troubleshooting

## I clicked Start Export and nothing seems to happen
- Keep the Amazon browser window open.
- Complete login/2FA/CAPTCHA in that window.
- The run continues automatically after auth is complete.

## Browser opens and then closes
- Usually the session timed out or auth did not complete.
- Start a new run and finish login before returning to the app.

## Export finished but some orders are missing
- Verify your date range includes those orders.
- Compare yearly totals in Amazon Orders UI to the export output.
- Download warnings log for details if run completed with warnings.

## Dashboard looks incomplete for item-level spend
- Some Amazon pages do not expose per-item prices.
- Total spend and order-level stats still use reliable order totals when available.

## App won’t start
Run:

```bash
npm install
npm run build
npm start
```

## Playwright browser missing

```bash
npx playwright install chromium
```

## Port 4173 already in use

```bash
PORT=4180 npm start
```
