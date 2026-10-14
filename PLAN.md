# PLAN: admin-migrate-1 preview-ban fix

- Keep the retained `codex/admin-migrate-1-20261013` branch and PR #470; do not open a replacement PR or touch TeacherKev PRs.
- Fix the PR preview workflow so a body whose first line is `[skip preview]` cannot deploy or comment preview access details.
- Remove or invalidate the stale PR #470 preview exposure without waking any other previews.
- Run focused preview workflow/tooling checks only, because the tester-feedback implementation and routed screenshots are unchanged.
- Refresh PR #470 notes only if needed, preserving `[skip preview]` as the first line, then restore `state/BUILD_RESULT.md` for driver merge.
