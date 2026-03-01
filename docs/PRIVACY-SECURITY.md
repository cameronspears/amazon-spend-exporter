# Privacy and Security

## Local-first model
- All automation runs on your machine.
- Exported files are written only to your selected output directory.

## Authentication
- You manually authenticate in a real browser window.
- The app does not persist account credentials.
- No anti-bot bypass is implemented.

## Data handling
- No telemetry or analytics beacons.
- No cloud storage or sync.
- Logs redact common sensitive keys (`cookie`, `token`, `authorization`, `password`, `address`).

## Practical guidance
- Run on a trusted computer.
- Store export files securely if they include purchase/payment metadata.
- Remove old exports if no longer needed.

## Security reporting
See [SECURITY.md](../SECURITY.md).
