## Plan

- Add signed HMAC `/api/internal/v1/admin/organizations` read/create and `/:id` read/update endpoints using existing internal auth/audit helpers.
- Validate create/update payloads, require HMAC for writes, support create idempotency, and record platform audit rows with created/before/after state.
- Gate legacy platform organization create/update/invite/delete controls so staff are directed to Internal while preserving preview-seat availability.
- Run focused platform route/API tests and the narrowest feasible typecheck before committing and opening a separate `[skip preview]` PR.
