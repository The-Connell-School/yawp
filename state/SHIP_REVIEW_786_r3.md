# Independent Ship Review — PR #786 (r3)

| Field | Value |
| --- | --- |
| **Verdict** | **SHIP** |
| **Reviewed head SHA** | `d73323d0171a39597a064ba46817025afd0aed70` |
| **PR** | https://github.com/The-Connell-School/yawp/pull/786 |
| **Branch** | `cursor/security-dependency-audit-8o-4bcc` |
| **Base** | `main` @ `5bbba21a1ee62d445ffe9cb6c02f6807cc4ab3da` |
| **Prior review** | r2 **BLOCK** @ `a2c3473f154100597eb56f7025059b18c10898e7` ([docs PR #788](https://github.com/The-Connell-School/yawp/pull/788)) |
| **Reviewer** | Independent cloud agent (r3) |
| **Date** | 2026-10-26 |

## Executive summary

PR #786 is a dependency and GitHub Actions hygiene pass (React Router 7.18.x, Prisma 7.10.1, root `overrides`, checkout/upload-artifact SHA alignment) with **`bun audit` 109 → 15** independently reproduced. Kevin/#608 tracks, secrets, and tfvars remain untouched.

Commit `d73323d` resolves the r2 **BLOCK**: `encodeTurboStreamBody` now uses React Router’s vendored single-fetch `encode()` (not npm `turbo-stream`) and materializes stream chunks with **`TextDecoder`** (`stream: true` + flush), with string-chunk fallback. The unit test asserts **`decodeRouterDataResponse` round-trip** and rejects corrupted decimal-byte bodies (`^\d+,`). No remaining broken `new Response(encode(...)).text()` or direct npm `turbo-stream` encode imports in E2E mocks.

**CI on reviewed head is green**, including **E2E smoke shard 3** (prior legal-signup failure) and aggregate Playwright gate (run [40265661948](https://github.com/The-Connell-School/yawp/actions/runs/40265661948)).

**Merge #786 is acceptable from an independent ship-review perspective** (this docs PR does not merge it).

---

## What changed since r2 (`a2c3473` → `d73323d`)

| Area | Change |
| --- | --- |
| **Rewritten** | `services/web-app/e2e/encode-turbo-stream-body.ts` — resolve `encode` from react-router `chunk-*.mjs`; TextDecoder materialization |
| **Strengthened** | `services/web-app/e2e/encode-turbo-stream-body.test.ts` — round-trip via `decodeRouterDataResponse`; guard against `91,123,...` corruption |
| **Unchanged** | All dependency, lockfile, workflow, and three free-tier spec call sites from r2 |

**Diff size (fix commit only):** 2 files, +45 / −7 lines (helper + test).

---

## Turbo-stream mock fix — correctness and completeness

### Remaining broken encode patterns

On reviewed head, repo search under `services/**`:

- **No** `new Response(encode(` usages.
- **No** `from 'turbo-stream'` or `require('turbo-stream')` in E2E test code.
- All Playwright single-fetch mocks in PR scope use `encodeTurboStreamBody`.

### Helper behavior (independent verification)

1. **`getReactRouterEncode()`** scans `react-router` package `chunk-*.mjs` for `encode` — same wire encoder the app uses for single-fetch, not the devDependency `turbo-stream@3.0.0` package import used in r2.
2. **Stream read loop** decodes `Uint8Array` chunks with `TextDecoder` (streaming + final flush); appends string chunks verbatim; throws on unexpected types.
3. **Local test** `bun test e2e/encode-turbo-stream-body.test.ts` — **pass** (Bun 1.4.4).
4. **Round-trip** — encoded body ends with newline, is not decimal-byte CSV, and `decodeRouterDataResponse(body.trim())` equals input payload.

### Residual risk (non-blocking)

Dynamic discovery of `encode` via directory scan could break if React Router rearranges chunk filenames without exporting `encode` from any `chunk-*.mjs`. Failure mode is an explicit throw at helper init time; acceptable for E2E-only tooling.

### CI evidence (r3 head)

| Check | r2 @ `a2c3473` | r3 @ `d73323d` |
| --- | --- | --- |
| E2E smoke shard 3 | **Fail** — four `free-tier.legal.spec.ts` tests (run [40264709112](https://github.com/The-Connell-School/yawp/actions/runs/40264709112)) | **Pass** (run [40265661948](https://github.com/The-Connell-School/yawp/actions/runs/40265661948), job [121387432187](https://github.com/The-Connell-School/yawp/actions/runs/40265661948/job/121387432187)) |
| E2E smoke shards 1–6 | Shard 3 fail; others pass | **All pass** |
| Merge E2E smoke / Playwright aggregate | Fail | **Pass** |
| ʦ TypeScript | Pass | **Pass** |
| Prisma migrations / migration-integration | Pass | **Pass** |
| Sign-on / demo / free-tier browser jobs | Pass (r2 head) | **Pass** |

---

## Audit / dependency posture (full diff vs `main`)

| Claim | r3 verification |
| --- | --- |
| **109 vulns on `main`** | **Confirmed** — `bun audit` at `5bbba21a` → `109 vulnerabilities (48 high, 53 moderate, 8 low)`. |
| **15 vulns on PR head** | **Confirmed** — `bun audit` at `d73323d` → `15 vulnerabilities (5 high, 9 moderate, 1 low)`. Artifact: `/opt/cursor/artifacts/bun-audit-pr786-r3-head-summary.txt`. |
| **Direct bumps** | React Router 7.18.2, Prisma 7.10.1, `turbo-stream@3.0.0` (dev/test decode tooling), `@happy-dom/global-registrator@21.0.4` — unchanged since r1/r2; consistent with stated audit scope. |
| **Root overrides** | Additive transitive CVE floors; no downgrades observed in lockfile diff review. |
| **Actions SHAs** | Checkout v7.0.1 pin; production-qa `upload-artifact` v7.0.2 — unchanged from r1/r2. |
| **Typecheck** | `NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck` **pass** on `d73323d` (~45s locally). |

**Commits on branch (4):** `0563c7c09` Actions SHA alignment; `387ed5534` audit/deps; `a2c3473f1` + `d73323d01` E2E mock fixes.

---

## Scope / Kevin #608

- **22 files** changed vs `main`; no application feature UI or business logic outside E2E test helpers and dependency/workflow pins.
- Diff contains **no** paths matching secrets, tfvars, or Kevin/#608 parked tracks.
- PR remains dependency/CI scope with `[skip preview]` posture.

---

## Findings

| ID | Severity | Finding |
| --- | --- | --- |
| F1 | Resolved | r2 blocker — invalid mock bodies from `Uint8Array` string coercion — fixed via RR encoder + TextDecoder. |
| F2 | Resolved | r2 major — weak/failing unit test — now asserts decodable round-trip and rejects CSV-byte corruption. |
| F3 | Info | `encode` discovery via `chunk-*.mjs` scan is slightly brittle but fails loudly; monitor on future RR upgrades. |
| F4 | Info | Dependency/audit/Actions portions remain evidence-backed; unchanged since r2 aside from green CI. |

---

## Verdict

**SHIP** — PR #786 at `d73323d0171a39597a064ba46817025afd0aed70` satisfies independent review criteria: correct single-fetch mock encoding, meaningful unit test, no leftover broken mocks, audit **109 → 15**, and CI green on the reviewed head including E2E smoke shard 3.

---

## Artifacts (this review)

| Artifact | Path |
| --- | --- |
| PR head audit summary | `/opt/cursor/artifacts/bun-audit-pr786-r3-head-summary.txt` |
| Unit test pass log | `bun test e2e/encode-turbo-stream-body.test.ts` (pass on reviewed head) |
| CI run (head) | https://github.com/The-Connell-School/yawp/actions/runs/40265661948 |
