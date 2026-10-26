# Independent Ship Review — PR #793 (r1)

| Field | Value |
| --- | --- |
| **Application PR** | https://github.com/The-Connell-School/yawp/pull/793 |
| **Title** | test(ci): guard GitHub Actions SHA pins (#8q) |
| **Branch** | `cursor/pin-github-actions-shas-9e31` |
| **Reviewed head SHA** | `3ef3d4e217a2dd171e4f56521fb6d3b9ab55c045` |
| **Base** | `main` |
| **Reviewer** | Independent ship review (cloud agent r1) |
| **Date (UTC)** | 2026-10-26 |

## Verdict

**SHIP**

PR #793 may merge after normal CI completion. This review does **not** merge #793.

## Scope reviewed

Diff vs `main` at the reviewed head:

- **1 file changed:** `scripts/deployment-contract.test.ts` (+60 / −0)
- **0 workflow YAML changes** (`.github/workflows/**` identical to `main` for this branch)

The change adds a `GitHub Actions supply-chain contract` describe block that scans only top-level files in `.github/workflows/` for third-party `uses:` lines.

## Contract behavior

### Rejects tag-only / floating third-party `uses:`

**Yes.** For each matched line, the ref after `@` must match `^[0-9a-f]{40}$`. Branch names, semver tags (`v4.3.1`), and `main` fail; full 40-character SHAs pass. Spot checks: `v4.3.1` → fail, `main` → fail, pinned SHAs → pass.

The scanner includes `owner/action@sha` references (requires `/` in the reference) and skips references starting with `./` (repo-local / composite actions).

### False positives (acceptable exclusions)

| Case | In scope? | Acceptable? |
| --- | --- | --- |
| Repo-local composite actions (`uses: ./…`) | Excluded (`./` prefix) | **Yes** — intentional; not third-party supply chain |
| Service container `image:` (e.g. `postgres:16@sha256:…`) | Not matched (`uses:` only) | **Yes** — docker images are out of scope for this guard |
| `docker://…` container actions | Not present in current workflows; would match `uses:` if added | **N/A today** — if introduced, would need the same SHA+comment convention or an explicit allowlist |
| Reusable workflow calls (`org/repo/.github/workflows/foo.yml@sha`) | Included (contains `/`) | **Yes** — still third-party/reusable workflow pins; current tree uses SHA+comment pattern |

At head `3ef3d4e217a2dd171e4f56521fb6d3b9ab55c045`, **85** third-party `uses:` entries are scanned; **0** violations. The new test passes locally:

`bun test ./scripts/deployment-contract.test.ts --test-name-pattern "GitHub Actions supply-chain"`

### Version comment requirement

Same-line comment must match `# vX.Y.Z` (semver) or `# beta`. Matches existing workflow style (including `anthropics/claude-code-action@… # beta`).

## Kevin / #608

**Untouched.** No workflow edits on this PR. `claude.yml` remains at the existing pinned SHA for `anthropics/claude-code-action` with `# beta`; this PR does not advance to live `beta` tip or otherwise address #608.

## Findings

### Blocking

None.

### Non-blocking / follow-ups

1. **No negative fixture in-repo** — regression is enforced by scanning live workflows only. A deliberate tag-only line would fail CI; consider a small unit test on the parser if the team wants failure-mode coverage without editing YAML.
2. **Comment convention is policy, not cryptographic proof** — the guard does not verify the SHA resolves to the labeled tag; it prevents floating `@v*` / `@main` regressions, aligned with #8q.
3. **Top-level workflows only** — does not recurse subdirectories under `.github/workflows/` (GitHub default layout; acceptable).

## CI / merge notes

- PR is test-only; `deployment-contract.test.ts` already runs in CI (`ci.yml` Prisma/deployment-contract job) and `deploy.yml`.
- Application PR merge strategy: **do not squash-merge** (per ship process).

## Recommendation summary

| Criterion | Result |
| --- | --- |
| Contract sound for `.github/workflows` third-party actions | Pass |
| Does not block legitimate current pins | Pass (85/85 compliant) |
| No workflow scope creep | Pass |
| Correctly rejects tag-only third-party `uses:` | Pass |
| False-positive exclusions acceptable | Pass |

**SHIP** — merge #793 when CI is green.
