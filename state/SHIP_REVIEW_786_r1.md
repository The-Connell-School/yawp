# Independent Ship Review — PR #786 (r1)

| Field | Value |
| --- | --- |
| **Verdict** | **BLOCK** |
| **Reviewed head SHA** | `387ed55343601a5717d0ba159fde530a4c041e94` |
| **PR** | https://github.com/The-Connell-School/yawp/pull/786 |
| **Branch** | `cursor/security-dependency-audit-8o-4bcc` |
| **Base** | `main` @ `5bbba21a1ee62d445ffe9cb6c02f6807cc4ab3da` |
| **Reviewer** | Independent cloud agent (r1) |
| **Date** | 2026-10-26 |

## Executive summary

PR #786 is a focused dependency and Actions-pin hygiene pass: React Router 7.18.x, Prisma 7.10.1, root `overrides`, and alignment of stale `actions/checkout` / `upload-artifact` SHAs with `ci.yml`. Audit counts and most verification claims hold. Scope excludes secrets, Terraform tfvars, and Kevin/#608 tracks.

**Do not merge as-is:** CI E2E smoke shard 3 fails on four tests because `turbo-stream@3.0.0` changes streaming behavior used in Playwright route mocks (`TypeError: Received non-Uint8Array chunk`). Main at the PR base is green; this regression is introduced by this diff.

---

## Audit claims check (109 → 15)

| Claim | Independent verification |
| --- | --- |
| **109 vulnerabilities on base** | **Confirmed.** `bun audit` at `5bbba21a` → `109 vulnerabilities (48 high, 53 moderate, 8 low)`. Artifact: `/opt/cursor/artifacts/bun-audit-main-baseline.txt`. |
| **15 vulnerabilities on PR head** | **Confirmed.** `bun audit` at `387ed553` → `15 vulnerabilities (5 high, 9 moderate, 1 low)`. Artifact: `/opt/cursor/artifacts/bun-audit-pr786-head.txt`. |
| **Net reduction** | **94 findings cleared** (109 − 15), consistent with PR narrative. |

Remaining 15 match PR’s documented skip bucket: Vite 5 / esbuild (Vite 6), Zod 3 (Zod 4), `@tiptap/core` (Tiptap 3), `image-size` via `pptxgenjs`, devtools `uuid`, and related template workspace paths.

---

## Risk review — direct bumps

### React Router (`7.3.x` / `7.15.x` → `^7.18.2`, lock `7.18.4`)

- Same major (7.x); addresses multiple published RR CVEs through &lt;7.18.x.
- **Typecheck:** `NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck` **pass** on reviewed head (~49s locally).
- **CI:** `ʦ TypeScript` **pass** on run [40263782844](https://github.com/The-Connell-School/yawp/actions/runs/40263782844).
- **Risk:** Low for runtime; standard patch-line upgrade within RR v7.

### Prisma (`7.2.x` → `^7.10.1`)

- Same major (7.x); toolchain/client alignment across `packages/prisma` and `services/web-app`.
- **CI:** `Prisma migrations` **pass**, `migration-integration` **pass** on reviewed head.
- **Risk:** Low; no schema changes in this PR.

### `turbo-stream` (`2.4.1` → `3.0.0`, devDependency)

- **Major** bump for GHSA-rxv8-25v2-qmq8 (single-fetch DoS).
- **Risk:** **High for CI** — breaks four E2E tests that mock React Router data responses via `encode()` + `new Response(...).text()` in `services/web-app/e2e/tests/free-tier.legal.spec.ts` (lines 95–100). Failures are deterministic across retries; not consistent with flake.
- **Required follow-up:** Update mocks to produce a turbo-stream v3–compatible body (e.g. buffer/string API supported by v3) before merge.

### `@happy-dom/global-registrator` (`20.x` → `^21.0.4`, dev)

- Major within test harness only.
- **CI:** No dedicated happy-dom job; broader browser suites largely pass except shard 3 issues above (turbo-stream, not happy-dom).

---

## Root `overrides` review

Added overrides extend the existing #744 pattern (`axios`, `compression`, `proxy-addr`, `ws`). New entries are semver caret floors on transitive packages surfaced by `bun audit fix --dry-run`, e.g. `@babel/core`, `body-parser`, `brace-expansion`, `postcss`, `qs`, `protobufjs`, `prosemirror-view`, `@opentelemetry/core`, `valibot`, etc.

- **Security posture:** Overrides pin **minimum patched versions**, not downgrades or known-bad ranges.
- **Consistency:** `postcss-selector-parser@^6.1.3` override matches the PR’s skip rationale (v7 fix incompatible with Tailwind 3 stack).
- **Risk:** Low–moderate (override drift is always possible); lockfile diff is the intended mechanism; no application source edits.

---

## GitHub Actions pin changes

| Action | Old pins (sample) | New pin | Tag verification |
| --- | --- | --- | --- |
| `actions/checkout` | v3.7.0 / v4.4.0 SHAs | `3d3c42e5aac5ba805825da76410c181273ba90b1` | Matches `actions/checkout` tag **v7.0.1** (GitHub API) |
| `actions/upload-artifact` | v4.6.2 SHA | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | Matches tag **v7.0.2** (GitHub API) |

- Aligns demo/deploy/preview/migration workflows with **`ci.yml`**, which already used these SHAs.
- Still full commit SHAs on `actions/*` (no mutable `@vN` tags).
- **Appropriateness:** **Good** — trusted publisher, verified tags, reduces pin skew across workflows.

---

## Skipped majors — reasonableness

| Skipped area | PR rationale | Review |
| --- | --- | --- |
| Vite 5 → 6 | Large build-tool jump; dev-server advisories | **Reasonable** |
| Zod 3 → 4 | Ecosystem on v3 | **Reasonable** |
| Tiptap 2 → 3 | Editor migration | **Reasonable** |
| `image-size` 2.x | Under pinned `pptxgenjs` | **Reasonable** |
| `postcss-selector-parser` v7 | Tailwind 3 expects v6 | **Reasonable**; consistent with override at v6 |
| `uuid` devtools tree | No patch on 11.x yet | **Reasonable** |

---

## Scope guardrails (Kevin / #608 / secrets / tfvars)

| Guardrail | Status |
| --- | --- |
| Kevin / #608 tracks | **Untouched** — diff limited to workflows, lockfile, root `package.json`, `packages/prisma/package.json`, `services/web-app/package.json` (17 files). |
| Secrets rotation / credential churn | **None** |
| `production.tfvars` / Terraform | **None** |
| Application UI / feature code | **None** |

---

## CI and verification (reviewed head)

Run: https://github.com/The-Connell-School/yawp/actions/runs/40263782844

| Check | Result |
| --- | --- |
| Changed paths | pass |
| Preview tooling | pass |
| ʦ TypeScript | pass |
| Prisma migrations | pass |
| migration-integration (separate workflow) | pass |
| Sign-on browser flows | pass |
| Demo feedback + preview access | pass |
| Free-tier locked preview browser | pass |
| E2E smoke shards 1, 2, 4, 5, 6 | pass |
| **E2E smoke shard 3** | **fail** (4 tests in `free-tier.legal.spec.ts`) |
| **E2E Tests (Playwright) aggregate** | **fail** (downstream of shard 3) |

**Failure signature (shard 3):**

```
TypeError: Received non-Uint8Array chunk
  body: await new Response(encode({ data: result })).text(),
```

Main CI at base SHA `5bbba21a` is **success** (recent runs on main).

---

## Findings

1. **[BLOCKER] `turbo-stream@3.0.0` breaks Playwright RR data mocks** — E2E smoke shard 3 fails four related tests; caused by devDependency major bump in this PR. Fix test harness (or equivalent) before merge.
2. **[INFO] Audit math is evidence-backed** — 109 → 15 independently reproduced.
3. **[INFO] Actions SHAs match official release tags** and match primary CI pins.
4. **[INFO] RR / Prisma bumps** — same-major, CI typecheck + migrations green.
5. **[INFO] Overrides** — transitive security floors; no insecure pinning observed.
6. **[INFO] Scope** — no secrets, tfvars, or Kevin/#608 creep.

---

## Verdict

**BLOCK** — merge PR #786 only after addressing the turbo-stream v3 E2E mock regression (small test change expected). All other hygiene in this PR looks shippable once CI is green again.

**Do not squash-merge #786 from this review.** This document does not authorize merge.
