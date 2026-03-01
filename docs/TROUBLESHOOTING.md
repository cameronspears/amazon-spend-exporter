# Troubleshooting

## Browser opens then run stalls
- Confirm you completed login/2FA in the opened Amazon window.
- Keep the browser open for the full run.
- Check the live status stage (`awaiting_auth`, `collecting_orders`, etc.).

## Completed with warnings
- Download `*.warnings.log` from Results.
- Common causes: DOM variants, unavailable detail pages, or non-purchasable entries.
- Re-run with `--debug` to capture detail HTML snapshots.

## Missing historical orders
- Ensure `--from` includes the year range you expect.
- Verify Amazon UI totals by year and compare with run event logs.

## Build/start issues
```bash
npm install
npm run build
npm run app
```

## Playwright missing browser
```bash
npx playwright install chromium
```

## Port conflict
Set a different port:
```bash
PORT=4180 npm run app
```
