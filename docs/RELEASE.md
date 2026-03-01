# Release Process (Public MVP)

## Pre-release checks
```bash
npm install
npm run build
npm test
```

## Manual acceptance
1. Run `npm run app`.
2. Export at least one month from a real account.
3. Confirm CSV/XLSX open in Excel.
4. Confirm results dashboard metrics are sane.

## Create release commit
```bash
git add .
git commit -m "Release v0.1.0"
```

## Tag
```bash
git tag v0.1.0
```

## Push
```bash
git push origin main
git push origin v0.1.0
```

## GitHub release notes
Include:
- local-only privacy model
- manual auth/CAPTCHA workflow
- known limitations (marketplace/order types)
- warning behavior and diagnostics guidance
