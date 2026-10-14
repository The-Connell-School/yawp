# PLAN: admin-migrate-2 platform repair

- Reuse `codex/admin-migrate-2-20261014` for the open platform PR; do not deploy or wake previews.
- Address review rejection by committing the Organizations legacy route deprecation UI that the screenshot claimed.
- Keep platform-only organization write actions available because create/preview-seat writes are intentionally outside Internal for this slice.
- Replace row spreading in the signed admin Organizations API with explicit response serialization.
- Run focused platform tests for the legacy Organizations route and signed Organizations API, then recapture the platform gated screenshot.
