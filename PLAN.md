# PLAN

Task: `admin-migrate-3` platform review fixes.

1. Remove or hard-gate the legacy platform organization create/update intents so writes only happen through signed internal APIs.
2. Extend platform tests for POST/PATCH unauthorized HMAC, invalid signatures, and malformed organization write payloads.
3. Run focused platform tests, capture the gated platform admin screenshot, commit, push, and update loop artifacts.
