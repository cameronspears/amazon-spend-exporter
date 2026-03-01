# Contributing

## Development setup
```bash
npm install
npx playwright install chromium
npm run build
npm test
```

## Running locally
- CLI: `npm run dev -- export --from 2025-01-01 --to 2025-12-31 --out ./exports`
- Web app: `npm run app`

## Pull requests
- Keep changes scoped and documented.
- Add/update tests for behavior changes.
- Update docs when UX/API behavior changes.

## Coding standards
- TypeScript strict mode
- ASCII by default
- Avoid storing credentials/secrets anywhere in repo/log output
