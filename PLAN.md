# PLAN: admin-migrate-n

- Keep the Assignment Types migration read-only: signed list/detail platform APIs, Internal list/detail inspection, and a de-emphasized legacy platform admin surface.
- Address reviewer rejection by making Assignment Types list pagination use a stable cursor matching the `createdAt desc, id desc` sort tuple.
- Add a multi-page platform API test proving no skipped or duplicated rows across cursor pages.
- Add deny/authz coverage for the signed detail API and the Internal detail loader before any platform client work.
- Re-run focused Internal and platform tests/typechecks, verify platform PR checks are green, then update PR descriptions and `BUILD_RESULT.md` with `[skip preview]` preserved.
