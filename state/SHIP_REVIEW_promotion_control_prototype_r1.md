# Independent Ship Review — promotion control prototype (prepare-only)

**Reviewer:** Cloud agent (factory prepare-only)  
**Verdict:** **SHIP for draft prototype** — library + tests + proposed integration only. **Do not merge to enable enforcement** without Bryant apply go-ahead.

## Scope reviewed

- `scripts/release-control/*` — holds, generation, grants, HMAC approval verifier, in-memory conditional store
- Tests: `promotion-control.test.ts`, `concurrency.test.ts` (19 cases)
- Docs: `docs/design/release-control/ARCHITECTURE.md`, proposed snippets (no apply)
- CI: tests wired into deployment-contract job list

## Evidence (simulated — not production enforced)

```text
bun test ./scripts/release-control/promotion-control.test.ts ./scripts/release-control/concurrency.test.ts
19 pass, 0 fail
```

Scenarios covered: concurrent hold/consume ordering, hold after green check (stale check), generation invalidation, expiry, single-use + replay idempotency, wrong SHA/digest, unreachable/malformed/missing state, worker approval forgery, permanent hold, direct-merge route inventory, TOCTOU documentation.

## Gaps explicitly UNSOLVED

1. **Forge merge enforcement** — no live required check calling broker; merge_group can remain stale.
2. **TOCTOU after consume** — no broker-held AWS/GitHub mutate credentials in this PR.
3. **Admin / IAM bypass** — documented, not narrowed.
4. **DynamoDB production adapter** — memory store only.
5. **Real OIDC / environment attestation** — HMAC test issuer only.

## Production safety

- No deploy, infra apply, permission widening, or flag flips in this PR.
- PR #917 auth fix: **not touched**.
- Production deployments remain **paused**; USO **off**; auto-deploy **off**.

## Next approval

Bryant: infra apply + workflow enablement + staging demo before claiming "enforced."
