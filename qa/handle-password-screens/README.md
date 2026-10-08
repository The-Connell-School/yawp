# Handle + password QA screenshots

Screenshots for this checklist live on branch **`qa/handle-password-preview-b2b0`** only (not on `#413`).

Capture sources:

- **Preview shell / teacher navigation:** `qa/capture-handle-password-preview.mjs` (requires `PREVIEW_BASE_URL` and `PREVIEW_ACCESS_CODE` via env — never commit codes).
- **Handle flows (signup, login, wrong password, duplicate handle, seat cap):** `services/web-app/e2e/tests/auth.free-tier-handle-join.qa-screens.spec.ts` with `QA_SCREENSHOT_DIR=../../qa/handle-password-screens`.
- **12h handle-only session expiry:** unit test in `services/web-app/app/utils/auth.server.test.ts` (`getSessionExpirationDateForUser uses 12h for handle-only accounts`).

Smoke E2E: `auth.free-tier-handle-join.spec.ts` (CI).
