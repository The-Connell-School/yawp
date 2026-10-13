# qa-suite-browser-cache-recovery

## Scope

- Platform-only QA infrastructure in `services/web-app`.
- Reuse the existing free-tier demo runner and seeded repro manifest checks from the QA suite branch context.
- Add a narrow browser executable resolution path so local Playwright runs can use an available cached Chrome/Chromium binary instead of failing only because the default headless-shell revision is absent.

## Steps

1. Bring the free-tier demo runner/test context into this branch without product behavior changes.
2. Add runner-level browser cache fallback and focused Bun coverage for explicit env, cached Chrome discovery, and missing-browser behavior.
3. Update the runner doc with the lane screenshot path and cache behavior.
4. Run focused script tests, typecheck where feasible, and launch/list the local deterministic suite enough to confirm it reaches runner/spec validation rather than the missing `chromium_headless_shell-1223` failure.
