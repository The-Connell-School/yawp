# Assignments Unification QA Runbook

**Branch:** `assignments-unification`
**Source design:** `docs/superpowers/specs/2026-04-28-assignments-unification-qa-design.md`
**Source plan:** `docs/superpowers/plans/2026-04-28-assignments-unification-qa.md`

Three phases. All must be green before merge.

---

## Phase 1 — Local verification

Local prod-restored DB (per `project_local_dev_setup` memory: yawp local DB is restored from S3 dump).

### 1a. Restore a clean copy of the prod dump (optional — skip if local is already at prod baseline)

```bash
# Only run this if your local DB has migration drift you want to reset.
# Otherwise skip — the existing local DB works.
AWS_PROFILE=yawp aws s3 cp s3://yawp-preview-videos/production.dump /tmp/production.dump
# Restore steps depend on your local pg setup; document what worked:
#   psql -U postgres -d yawp -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
#   pg_restore -U postgres -d yawp /tmp/production.dump
```

### 1b. Capture pre-migration state

```bash
cd packages/prisma
DATABASE_URL="postgresql://localhost:5432/yawp" bun ./scripts/assignments-unification-preflight.ts
```

Expected: `OK: pass-7b invariant holds` and `State written to /tmp/assignments-unification-preflight.json`. If it exits non-zero, do NOT proceed — investigate the conflict.

### 1c. Apply the migration

```bash
DATABASE_URL="postgresql://localhost:5432/yawp" bunx prisma migrate deploy
```

Expected: migration `20260414130000_unify_assignment_model` applied cleanly.

### 1d. Run postcheck

```bash
DATABASE_URL="postgresql://localhost:5432/yawp" bun ./scripts/assignments-unification-postcheck.ts
```

Expected: `OK: all post-migration assertions passed.` Fix any failures and re-run from 1a (need clean pre-state).

### 1e. Run behavior contracts

```bash
DATABASE_URL="postgresql://localhost:5432/yawp" bun test ./scripts/assignments-unification-contracts.test.ts
```

Expected: all tests pass.

### 1f. Smoke the app locally

```bash
cd ../../services/web-app
bun run dev
```

Manually verify in browser (5 minutes):
- Sign in as teacher, view a class with students, see assignments listed
- Sign in as student, open an existing document, type a sentence, save
- Create a new Free Write doc

If any flow breaks, halt — fix and rerun from 1d.

---

## Phase 2 — Preview env verification

### 2a. Push branch and open PR

```bash
cd ../..
git push -u origin assignments-unification
gh pr create --title "Assignments unification: rename + structural changes" --body "$(cat <<'EOF'
## Summary
- Rename StudentCourse* → AssignmentType*; TeacherCourse* → TeacherTraining*
- Drop Document.classId; add Document.assignmentTypeId (NOT NULL)
- Drop ClassStudentCourse whitelist; add ownership cols on AssignmentType
- Seed Free Write AssignmentType for documents with no module sessions

See `docs/superpowers/specs/2026-04-20-assignments-unification-migration-delta.md` for full delta.

## QA
Per `docs/superpowers/runbooks/2026-04-28-assignments-unification-qa-runbook.md`.

## Test plan
- [ ] Local preflight + migrate + postcheck + contracts green
- [ ] Preview env preflight + postcheck + contracts green
- [ ] Agentic exploratory pass clean (no blockers)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Wait for the preview workflow to deploy. The PR comment will include the preview URL when ready (see `.github/workflows/preview-environments.yml`).

### 2b. Run preflight + postcheck against the preview DB

The preview env runs in schema `pr_<PR_NUMBER>` of the shared preview Postgres. Pull the connection details:

```bash
PR_NUMBER=$(gh pr view --json number -q .number)
BASE_URL=$(AWS_PROFILE=yawp aws secretsmanager get-secret-value \
  --region us-east-1 --secret-id yawp-preview/database-url \
  --query SecretString --output text)
SCHEMA_URL="${BASE_URL}?sslmode=require&schema=pr_${PR_NUMBER}"

cd packages/prisma
DATABASE_URL="$SCHEMA_URL" PREFLIGHT_STATE_PATH=/tmp/preview-preflight.json \
  bun ./scripts/assignments-unification-preflight.ts
# (Note: preview env DB is *already migrated* by the time the workflow finishes,
# so this captures the post-migration state — preflight will fail on missing
# old-table queries. That's expected. Run postcheck instead:)

DATABASE_URL="$SCHEMA_URL" \
  bun ./scripts/assignments-unification-postcheck.ts
```

**Important caveat:** The preview workflow restores the prod dump and immediately runs `prisma migrate deploy`, so by the time you query, the migration is already applied. Preflight against preview will fail (the old tables are gone). For preview verification, only postcheck and contracts apply — and they run with the local preflight state file (which captured pre-migration data from the same prod dump).

```bash
DATABASE_URL="$SCHEMA_URL" PREFLIGHT_STATE_PATH=/tmp/assignments-unification-preflight.json \
  bun test ./scripts/assignments-unification-contracts.test.ts
```

Expected: all tests pass against preview. If any contract fails, the migration behaved differently in preview than locally — investigate.

### 2c. Smoke the preview URL

Use the preview URL from the PR comment with credentials `teacher@fake.test` / `teacher123` and `student@fake.test` / `student123`. Repeat the local 1f checks against the preview URL.

---

## Phase 3 — Agentic exploratory pass

Run from a Claude Code session (interactive). Two parallel subagents via the `Agent` tool. Paste this template into the session:

```
I want to run a parallel agentic QA pass on the preview env for assignments-unification.
Preview URL: <PASTE_PREVIEW_URL>

Spawn two subagents in a single message (parallel execution):

1. Teacher persona — credentials teacher@fake.test / teacher123
2. Student persona — credentials student@fake.test / student123

Each subagent should:
- Read docs/superpowers/specs/2026-04-20-assignments-unification-migration-delta.md
- Use Playwright (already installed in services/web-app) to drive Chromium headed against the preview URL
- Execute their persona's flows (~5 min per persona)
- Write a markdown report to tmp/qa-reports/<persona>-$(date +%Y%m%d-%H%M).md grouped by severity: blocker / concern / nit / no-issue-found

Teacher persona flows:
- Sign in
- Create a new Assignment using the AssignmentType picker (verify all 6 system types appear, including Free Write)
- View class page with student work
- Open a student's document
- Try to grade an essay

Student persona flows:
- Sign in
- Open an existing document
- Start a new Free Write document
- Work through one tutor module session
- Submit an essay

After both reports are written, summarize them and flag any "blocker" items.
```

### Triage

Read each report. The merge gate:
- 0 blockers → proceed
- ≥1 blocker → fix on branch, redeploy preview (Phase 2), rerun Phase 3

Concerns and nits are non-gating but logged for follow-up.

---

## Phase 4 — Merge

When all three phases are green:

```bash
gh pr merge --squash --auto
```

After deploy completes, run postcheck against prod to confirm the migration applied cleanly:

```bash
PROD_URL=$(AWS_PROFILE=yawp aws secretsmanager get-secret-value \
  --region us-east-1 --secret-id yawp-prod/database-url \
  --query SecretString --output text 2>/dev/null || echo "MANUAL_FETCH_REQUIRED")
# (Update the secret-id above to whatever the prod secret is named.)

DATABASE_URL="$PROD_URL" \
  bun ./packages/prisma/scripts/assignments-unification-postcheck.ts
```

Expected: green. If red, follow incident response (the migration is in a single transaction so partial state shouldn't be possible — but verify).

---

## Rollback plan

If the migration breaks something post-deploy:
1. The migration is one transaction — Postgres rolled back atomically on any error during apply.
2. If the migration applied successfully but app behavior is broken, the inverse rename is straightforward but expensive (28+ ALTERs + restoring `Document.classId`). Prefer a forward fix over rollback.
3. Worst case: restore latest pre-migration prod backup (RPO matches your backup cadence).
