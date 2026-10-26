# Independent Ship Review — PR #786 (r2)

| Field | Value |
| --- | --- |
| **Verdict** | **BLOCK** |
| **Reviewed head SHA** | `a2c3473f154100597eb56f7025059b18c10898e7` |
| **PR** | https://github.com/The-Connell-School/yawp/pull/786 |
| **Branch** | `cursor/security-dependency-audit-8o-4bcc` |
| **Base** | `main` @ `5bbba21a1ee62d445ffe9cb6c02f6807cc4ab3da` |
| **Prior review** | r1 **BLOCK** @ `387ed55343601a5717d0ba159fde530a4c041e94` ([docs PR #787](https://github.com/The-Connell-School/yawp/pull/787)) |
| **Reviewer** | Independent cloud agent (r2) |
| **Date** | 2026-10-26 |

## Executive summary

PR #786 remains a sound dependency and GitHub Actions pin hygiene pass (React Router 7.18.x, Prisma 7.10.1, root `overrides`, checkout/upload-artifact SHA alignment). Audit evidence still holds at **109 → 15** vulnerabilities. Kevin/#608 tracks, secrets, and tfvars are untouched.

Commit `a2c3473` addresses the r1 turbo-stream E2E blocker by centralizing mock body encoding, but the **`encodeTurboStreamBody` helper is incorrect for turbo-stream v3 in Bun/CI**: it concatenates `Uint8Array` chunks with `+=`, producing comma-separated byte decimals instead of UTF-8 turbo-stream line JSON. The added unit test fails locally and does not assert decodable output. **E2E smoke shard 3 still fails** on the same four `free-tier.legal.spec.ts` tests (CI run [40264709112](https://github.com/The-Connell-School/yawp/actions/runs/40264709112), job [121384487277](https://github.com/The-Connell-School/yawp/actions/runs/40264709112/job/121384487277)).

**Do not merge #786** until the helper materializes bytes correctly (and the unit test proves round-trip decode).

---

## What changed since r1 (`387ed553` → `a2c3473`)

| Area | Change |
| --- | --- |
| **New** | `services/web-app/e2e/encode-turbo-stream-body.ts` — shared helper for mocked `.data` bodies |
| **New** | `services/web-app/e2e/encode-turbo-stream-body.test.ts` — single Bun unit test |
| **Updated** | `free-tier.legal.spec.ts`, `free-tier.artboard-states.spec.ts`, `free-tier.admin-copy-pass1-evidence.spec.ts` — replace inline `new Response(encode(...)).text()` with `encodeTurboStreamBody(...)` |
| **Unchanged** | All dependency, lockfile, workflow, and audit scope from r1 (including `turbo-stream@3.0.0`) |

**Diff size (fix commit only):** 5 files, +35 / −14 lines.

---

## Turbo-stream mock fix — correctness and completeness

### Remaining `encode` → `Response.text` patterns

Repo-wide search on reviewed head: **no** remaining `new Response(encode(` or `Response(encode(` usages. All Playwright single-fetch mocks in this PR’s scope route through `encodeTurboStreamBody`.

### Helper behavior (independent verification)

On reviewed head, with `turbo-stream@3.0.0` under Bun (same runtime CI uses for `bun run test:e2e:smoke`):

1. **`encode()` yields `Uint8Array` stream chunks**, not strings.
2. **`body += chunk` string-coerces each chunk** to comma-separated decimal bytes (e.g. `91,123,34,...`), **not** valid turbo-stream JSON.
3. **`decodeRouterDataResponse(body)` throws** on helper output; **`new Response(encode(value)).text()`** produces valid line JSON and decodes correctly.
4. **Unit test** `e2e/encode-turbo-stream-body.test.ts` **fails** (expects substring `"ok":true` in body; actual body is byte-decimal garbage).

The helper comment assumes “string chunks, not Uint8Array,” which is **inverted** for v3 in this environment.

### CI evidence (r2 head)

| Check | r1 @ `387ed553` | r2 @ `a2c3473` |
| --- | --- | --- |
| E2E smoke shard 3 | **Fail** — `TypeError: Received non-Uint8Array chunk` at `free-tier.legal.spec.ts:99` (run [40263782844](https://github.com/The-Connell-School/yawp/actions/runs/40263782844)) | **Fail** — same four legal signup tests; failure mode shifts to **6s timeout / `toBeVisible` assertion** (mock body not consumed by router) (run [40264709112](https://github.com/The-Connell-School/yawp/actions/runs/40264709112)) |
| Other smoke shards | Pass (except shard 3 cascade) | **Pass** (1, 2, 4, 5, 6) |
| ʦ TypeScript | Pass | **Pass** |
| Prisma migrations / migration-integration | Pass | **Pass** |
| Sign-on / demo browser jobs | Pass | **Pass** |
| Aggregate E2E gate | Fail | **Fail** (merge-reports job [121386287371](https://github.com/The-Connell-School/yawp/actions/runs/40264709112/job/121386287371)) |

### Required follow-up (for #786, not this docs PR)

Materialize v3 stream chunks without unsafe coercion, e.g. decode each `Uint8Array` with `TextDecoder` (and still handle string chunks if encountered), **or** use an API that accepts the encoded stream in Bun without breaking on chunk type. Extend the unit test to assert:

- `JSON.parse(body)` succeeds (turbo-stream line array), and/or
- `decodeRouterDataResponse(body)` returns expected `{ data: ... }`.

Re-run shard 3 (legal + artboard specs that use the helper).

---

## Audit / dependency posture (full diff vs `main`)

| Claim | r2 verification |
| --- | --- |
| **109 vulns on `main`** | **Confirmed** — `bun audit` at `5bbba21a` → `109 vulnerabilities (48 high, 53 moderate, 8 low)`. |
| **15 vulns on PR head** | **Confirmed** — `bun audit` at `a2c3473` → `15 vulnerabilities (5 high, 9 moderate, 1 low)`. Artifact: `/opt/cursor/artifacts/bun-audit-pr786-r2-head-summary.txt`. |
| **Direct bumps** | React Router 7.18.2, Prisma 7.10.1, `turbo-stream@3.0.0`, `@happy-dom/global-registrator@21.0.4` — unchanged from r1; still appropriate within stated skip matrix. |
| **Root overrides** | Same additive CVE floors as r1; no downgrades observed in lockfile diff. |
| **Actions SHAs** | Checkout → v7.0.1 pin; production-qa `upload-artifact` → v7.0.2; aligns with `ci.yml`. |
| **Typecheck** | `NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck` **pass** on `a2c3473` (~46s locally). |

---

## Scope / Kevin #608

- **22 files** changed vs `main`; no application feature UI or business logic outside E2E test helpers.
- Diff contains **no** paths matching secrets, tfvars, or Kevin/#608 parked tracks (independent path filter on `main...HEAD`).
- PR body `[skip preview]` and dependency-only scope consistent with r1.

---

## Findings

| ID | Severity | Finding |
| --- | --- | --- |
| F1 | **Blocker** | `encodeTurboStreamBody` produces invalid mock bodies under Bun (`Uint8Array` coerced to decimal string); shard 3 legal tests still fail on CI. |
| F2 | **Major** | Unit test does not validate decodable turbo-stream output and **fails** on reviewed head. |
| F3 | Info | r1’s `Response(encode()).text()` failure is avoided, but replacement path is still broken for CI. |
| F4 | Info | Dependency/audit/Actions portions of PR remain evidence-backed and unchanged since r1. |

---

## Verdict

**BLOCK** — merge #786 only after F1/F2 are resolved and E2E smoke shard 3 is green on the PR branch head.

---

## Artifacts (this review)

| Artifact | Path |
| --- | --- |
| PR head audit summary | `/opt/cursor/artifacts/bun-audit-pr786-r2-head-summary.txt` |
| Unit test failure log | `bun test e2e/encode-turbo-stream-body.test.ts` (fail on reviewed head) |
