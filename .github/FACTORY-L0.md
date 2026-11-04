# Factory L0 — PR CI fast path (yawp)

Autonomous Software Factory **L0** changes are copy-heavy, reversible UI/chrome edits with no schema or behavioral risk (example baseline: PR #907 class-sheet error copy). This repo supports an **opt-in** GitHub label so those PRs can skip the expensive PR CI merge gate while keeping a cheap smoke job and **fail-closed** guards.

## How to opt in

1. Classify the work as L0 (copy / reversible chrome only). If there is schema, auth, billing, or logic risk, do **not** use this path.
2. Keep the diff inside allowed paths (see below).
3. Add the label **`factory-l0`** to the pull request (apply after opening or before the latest push you intend to merge).
4. Before merge, outside GitHub Actions:
   - **Model self-check** of the diff (strings, no accidental logic).
   - **PR preview smoke**: load the affected surface, confirm copy, no console errors on that path.

Removing the label or pushing out-of-scope files re-enables full CI on the next run.

## Allowed diff scope (fail closed)

Fast path is active only when **every changed file** stays under:

- `services/web-app/**`
- `docs/**`
- Root or tree `*.md` (except changes under forbidden paths above)

Any change under these prefixes **blocks** the fast path (full CI runs even with the label):

- `packages/**` (including **`packages/prisma/migrations/**`**)
- `scripts/**`, `.github/**`, `bin/**`, `infra/**`, `design/**`, `qa/**`, `granola/**`, `state/**`
- Lockfiles, `package.json`, `tsconfig*`, `bunfig.toml`, `playwright.config.*`, `Dockerfile*`

Eligibility logic is mirrored in `scripts/ci/factory-l0-eligibility.ts` (unit tested).

## What runs on a labeled, eligible L0 PR

| Gate | Behavior |
|------|----------|
| **Factory L0 smoke** | Runs: install, `prisma generate`, `bun web-app:typecheck` |
| **Prisma migrations** (CI job) | Skipped (placeholder success) |
| **ʦ TypeScript** (full unit matrix) | Skipped (placeholder success) |
| **Playwright / E2E** | Skipped (same mechanism as draft PRs) |
| **Preview tooling** | Unchanged (runs only if `scripts/preview/**` changed — uncommon for L0) |
| **Migration Integration** workflow | Skipped when the label is active and the PR does **not** touch `packages/prisma/migrations/**` |
| **PR preview deploy** | Unchanged (`preview-environments.yml`) |

## What is unchanged

- **Unlabeled PRs** — identical to previous CI behavior.
- **Labeled but ineligible PRs** — full CI; workflow logs a warning explaining why the label was ignored.
- **`main` push** — full CI, deploy, and demo pipelines unchanged.
- **Migrations present** — Migration Integration and full Prisma CI always run; the fast path never bypasses migration checks when migration files change.

## Branch protection note

Teams may add **Factory L0 smoke** as an optional or required check for L0 merges. The skipped jobs (`Prisma migrations`, `ʦ TypeScript`, E2E) remain green via explicit skip jobs so existing required checks do not block eligible L0 PRs.

## Related

- Factory playbook and #907 baseline: see internal L0 playbook / retro artifacts.
- Draft PRs still skip heavy E2E until marked ready for review; that behavior is independent of `factory-l0`.
