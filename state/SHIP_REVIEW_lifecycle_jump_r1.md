# Independent Ship Review r1 — lifecycle jump expectations

**Branch:** `cursor/free-tier-lifecycle-jump-expectations-f162`  
**Base:** `main`  
**Reviewer:** Independent ship review (Cloud Agent)  
**Date:** 2026-11-05  

**SHIP** — merge to `main` for demo when this head's CI is green.

Split from closed mega PR #877. Only the dev-panel lifecycle jumps that were not already on `main`.

| Intent | Evidence | Result |
| --- | --- | --- |
| `lifecycle.rejected` and `lifecycle.expired` are catalog states with jump expectations | `free-tier-states.catalog.ts`, `free-tier-jump-expectations.ts` | **Met** |
| Jumps set the application to `REJECTED` or `EXPIRED` and open `/app/free-tier/status` | `free-tier-jump.server.ts`; unit test asserts redirect and upsert status | **Met** |

Local: `free-tier-jump.server.test.ts`, `free-tier-jump-expectations.test.ts`, and `free-tier-states.catalog.test.ts` pass.

No schema, auth, billing, or production data change. Dev panel only.
