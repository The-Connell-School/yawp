# Independent Ship Review r1 — PR #804

| Field | Value |
| --- | --- |
| **Application PR** | [#804](https://github.com/The-Connell-School/yawp/pull/804) — `test: align production YAWP_ENVIRONMENT fixture (#8x)` |
| **Reviewed head (exact)** | `d390cc46b317b14f922df215cacb9b8c4d769314` |
| **Branch** | `cursor/align-production-yawp-environment-fixture-94b7` |
| **Base at review** | `main` @ `046dcdc5` ([#802](https://github.com/The-Connell-School/yawp/pull/802) merged) |
| **Reviewer** | Independent ship review (Cloud Agent r1) |
| **Date (UTC)** | 2026-10-26 |

## Verdict: **SHIP**

PR #804 is tests-only follow-up to #802. Dev-panel production guard tests now model App Runner with `YAWP_ENVIRONMENT=production` as the primary case, matching the production Docker stage after #802. Legacy unset-env behavior remains covered in `dev-panel-runtime.server.test.ts`. No product, deployment-contract, or infra changes. This review does not merge #804.

---

## Diff vs `main` (reviewed head)

**Scope:** 5 files, +18 / −9 lines — all under `services/web-app/app/dev-panel/`:

| File | Change |
| --- | --- |
| `dev-panel-api-production.test.ts` | `productionRuntimeEnv.YAWP_ENVIRONMENT`: `undefined` → `'production'`; comment cites #802 |
| `dev-panel-class-simulation-production.test.ts` | Two production cases set `env.YAWP_ENVIRONMENT = 'production'` instead of `delete` |
| `dev-panel-production-guard.test.ts` | Assign `'production'`; drop redundant `delete process.env.YAWP_ENVIRONMENT` |
| `dev-panel-route-guard.server.test.ts` | Production cases for `assertDevPanelRoute` / `assertDevPanelUnlockRoute` set `'production'` |
| `dev-panel-runtime.server.test.ts` | Split one test into explicit `=production` and unset legacy cases |

No other paths differ from `main` at the reviewed head.

---

## Fixture correctness vs #802

**#802 behavior:** Production image runtime stage now sets `ARG YAWP_ENVIRONMENT=production` and `ENV YAWP_ENVIRONMENT=$YAWP_ENVIRONMENT` (see `services/web-app/Dockerfile`, guarded by `scripts/deployment-contract.test.ts`). App Runner does not inject `YAWP_ENVIRONMENT`; the baked value is `production`.

**Product gate:** `isDevPanelBuildEnabled` returns `false` when `YAWP_ENVIRONMENT` normalizes to `production`:

```6:8:services/web-app/app/dev-panel/dev-panel-runtime.server.ts
  const yawp = String(env.YAWP_ENVIRONMENT ?? '').trim().toLowerCase();
  if (yawp === 'production') return false;
```

**Assessment:** Primary production test vectors now match deployment reality. Assertions still expect 404 / disabled panel in production — they do not relax guards or imply dev-panel access in prod.

**Already aligned elsewhere (unchanged by #804):** `dev-panel-bundle.test.ts` builds with `YAWP_ENVIRONMENT: 'production'`; LTI and mock production guards already use explicit `production`. No stale “no YAWP_ENVIRONMENT at runtime” comments remain in `app/dev-panel/` after this PR.

---

## Unset legacy coverage

After #802, unset `YAWP_ENVIRONMENT` at runtime is not the production deployment path, but older images or misconfiguration could still omit it.

**Dedicated test:** `dev-panel-runtime.server.test.ts` adds `production build and runtime stay disabled when YAWP_ENVIRONMENT is unset` with `NODE_ENV=production` only.

**Mechanism (unchanged product code):** With empty `YAWP_ENVIRONMENT`, `isDevPanelBuildEnabled` does not hit the explicit `production` branch but also fails demo/preview/local paths under `NODE_ENV=production`, so build and runtime gates remain off.

**Gap (non-blocking):** Route-level production tests (`assertDevPanelRoute`, class simulation, API production) no longer exercise the unset-env vector; only the runtime unit test does. Acceptable because unset and explicit `production` both disable the panel; the explicit case is what must not drift after #802.

---

## Kevin / #608

PR [#608](https://github.com/The-Connell-School/yawp/pull/608) (“Platform enhancements behind platform-enhancements flag”) is **untouched**. This diff touches only dev-panel test files; no feature flags, platform-enhancements, or unrelated application code.

---

## Regression and scope risk

| Check | Result |
| --- | --- |
| Product / server code | **None** |
| Dockerfile / deployment contract | **None** |
| Terraform / secrets | **None** |
| Scope creep | **None** — single commit, dev-panel tests only |
| Would tests allow panel in prod if product regressed? | **No** — same 404/disabled expectations; stricter env fixture |

---

## Local verification (reviewed head)

Ran targeted tests at `d390cc46b317b14f922df215cacb9b8c4d769314`:

```text
bun test app/dev-panel/dev-panel-api-production.test.ts \
  app/dev-panel/dev-panel-class-simulation-production.test.ts \
  app/dev-panel/dev-panel-production-guard.test.ts \
  app/dev-panel/dev-panel-route-guard.server.test.ts \
  app/dev-panel/dev-panel-runtime.server.test.ts
→ 19 pass, 0 fail
```

---

## CI (PR #804 @ reviewed head)

At review time: **Changed paths** and preview tooling **passed**; broader CI (TypeScript, E2E, migration-integration) was **pending** — consistent with a test-only dev-panel change already in the changed-paths profile. No failed check attributable to this diff was observed.

---

## Findings summary

1. **Correct follow-up to #802** — production tests now mirror baked `YAWP_ENVIRONMENT=production`.
2. **Guards unchanged** — still assert dev panel disabled / 404 in production.
3. **Legacy unset path retained** — runtime unit test documents pre-#802-style omission still safe.
4. **Tight scope** — five test files, one commit, no product or contract edits.
5. **#608 / Kevin scope clean** — no overlap.

---

## Decision

**SHIP** — merge #804 when normal release process allows (this review does not merge it).
