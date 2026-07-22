# AP History DBQ/LEQ Pilot Implementation Plan

Issue: #215

1. Record the #191/#198/#202/#205 preservation matrix and high-risk proof
   contract in the run ledger.
2. Add red schema/domain/route tests for snapshot v2, public-domain metadata,
   PDF-import gating, assignment tutor policy, timer idempotency, tenant scope,
   and backward-compatible v1 reads.
3. Add additive Prisma migration and deterministic APUSH DBQ/LEQ seed data;
   rehearse deploy/rollback/postcheck in the isolated workspace database.
4. Implement the AP PDF extraction service and route through the unchanged
   Anthropic SDK, AI admission, strict validation, and metadata-only logging.
5. Build a real network-level Anthropic fixture/proof for success, retry,
   malformed, 429/500, and connection-drop behavior.
6. Port the bounded #191 prompt-library/source-preview/DBQ workspace surface,
   then add the narrower gated PDF-import sheet, durable timer, tutor-off state,
   consistent provenance UI, mobile tabs, and keyboard semantics.
7. Preserve useful APUSH writing-process tutor guidance through the shared
   module/session model; do not import broad #198/#205 product expansion.
8. Extend browser coverage first, then make teacher library/import, student
   DBQ/LEQ write/reload/submit, teacher review, tutor policy, mobile, and axe
   scenarios green.
9. Run focused/full diagnostics, typecheck, production build, Prisma checks,
   backend proof, visual screenshots, and narrated browser QA.
10. Run independent review roles, assemble the evidence pack, commit locally,
    comment on #215, and leave push/PR/stale-PR/merge/deploy markers for the
    authorized human step.
