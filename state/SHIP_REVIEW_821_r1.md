# Independent Ship Review — Yawp! PR #821 (r1)

| Field | Value |
|---|---|
| **PR** | https://github.com/The-Connell-School/yawp/pull/821 |
| **Branch** | `cursor/residual-audit-remove-e2e-helper-4ec3` |
| **Base** | `main` |
| **Reviewed head (`headRefOid`)** | `fb3b42df7135c09eee89a027b245fee78ed1878a` |
| **Head confirmed on GitHub** | Yes (matches at review time) |
| **Quality ticket** | #8ae |
| **Reviewer** | Independent Ship Review (Cloud Agent) |
| **Review date (UTC)** | 2026-10-26 |
| **Verdict** | **SHIP** |

## Scope claim vs diff

Compared `origin/main...fb3b42df7135c09eee89a027b245fee78ed1878a` (3 files, +32 / −37 lines):

| Path | Change |
|---|---|
| `services/web-app/e2e/helpers/dev-panel-feedback.ts` | Remove unused `installDevPanelStorageResetOnce` only |
| `package.json` | Root `overrides`: add `"esbuild": "^0.25.0"` |
| `bun.lock` | Lock `esbuild` / `@esbuild/*` from 0.21.5 → 0.25.12 |

No product UI, Terraform, `production.tfvars`, `reset_data`, secrets, or overlap with Kevin / #608 / #437 / #459 / #484 / #723 in the diff.

## Checklist

### E2E helper removal

- `installDevPanelStorageResetOnce` is **not referenced** anywhere at reviewed head (`git grep` over tree: zero matches).
- On `main` before this PR, the symbol existed only as an export in `dev-panel-feedback.ts` (no importers); removal is dead-code cleanup aligned with Ship Review #818 r2 nit.
- The only hunk in `dev-panel-feedback.ts` besides the deletion is unchanged context for `clearDevPanelStorageWhenStable` and all downstream dev-panel / artboard wait helpers (`waitForDevPanelReady`, `openDevToolsPanel`, `openDevPanelSection`, etc.). **No** edits to storage-clear timing or navigation waits that could reintroduce draft wipe.

### Dependency override (GHSA-67mh)

- Single new override entry: `esbuild: ^0.25.0` (non-major within `esbuild` 0.x).
- `bun.lock` changes are limited to `esbuild` and `@esbuild/*` platform packages (0.21.5 → 0.25.12); no other package version bumps detected in the lockfile diff.
- PR body documents deferred semver-major audit items separately; none are sneaked into this diff.

### Audit count

- PR claims root `bun audit` **15 → 14** (esbuild moderate cleared). Not re-run locally in this review environment (`bun` unavailable); claim is consistent with override intent and lockfile resolution.

## Findings

| ID | Severity | Finding |
|---|---|---|
| F1 | Info | Residual audit work is appropriately scoped: one advisory via override plus unused e2e helper removal. |
| F2 | Info | `esbuild` 0.21 → 0.25 is a minor-line bump within 0.x; acceptable for stated GHSA-67mh fix; monitor vite 5 + esbuild 0.25 compatibility via CI (TypeScript job already green at review snapshot). |

## Blockers

None.

## CI (exact head `fb3b42df7135c09eee89a027b245fee78ed1878a`)

Workflow [actions run 40319185862](https://github.com/The-Connell-School/yawp/actions/runs/40319185862) was **in progress** at review time. Snapshot:

| Check | Status |
|---|---|
| Changed paths | pass |
| Preview tooling | pass |
| migration-integration | pass |
| ʦ TypeScript | pass |
| 🧪 Free-tier locked preview browser | pass |
| Prisma migrations | pending |
| 🔐 Sign-on browser flows | pending |
| 🧪 Demo feedback + preview access browser checks | pending |
| 🧪 E2E smoke (shards 1–6) | pending |

**CI note:** Verdict is **not** blocked solely for in-progress jobs; scope is low-risk (e2e helper deletion + lockfile override). Merge gate should still wait for full green CI on the merged head.

## Recommendation

**SHIP** PR #821 when CI completes green. Do not merge via this review artifact; this file records r1 approval only.

## Related

- Subject PR: #821
- Prior context: unused helper nit from Ship Review #818 r2; artboard e2e deflake on #818
