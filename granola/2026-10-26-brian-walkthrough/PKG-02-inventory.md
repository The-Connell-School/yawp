# PKG-02 · Demo database inventory

This file is the **check-in location** for the read-only inventory Bryant/Platform generates on the demo host before the destructive cleanup run.

## Status (Cloud Agent, Oct 26 2026)

| Item | Status |
| --- | --- |
| Live demo inventory | **Not run from cloud agent** (no demo `DATABASE_URL` in this environment) |
| Cleanup script | `services/web-app/scripts/demo/demo-db-cleanup.ts` |
| Classification rules | `services/web-app/scripts/demo/demo-cleanup-keep.ts` |

## Generate inventory on demo (BRYANT ACTION REQUIRED)

1. **Snapshot** the demo Postgres database (`yawp_demo`) and record the snapshot id in the PR/run report.
2. On the demo host (or a tunnel with demo credentials), export:

   ```bash
   export APP_ENV=demo
   export DEPLOY=demo
   export DATABASE_NAME=yawp_demo
   export DATABASE_URL='postgresql://…@…demo…/yawp_demo'
   ```

3. Run read-only inventory and save over this file:

   ```bash
   cd services/web-app
   bun scripts/demo/demo-db-cleanup.ts --inventory \
     --output=../../granola/2026-10-26-brian-walkthrough/PKG-02-inventory.md
   ```

4. Review dry-run output:

   ```bash
   bun scripts/demo/demo-db-cleanup.ts --dry-run | tee /tmp/pkg-02-dry-run.txt
   ```

5. After review, apply (Platform only — **not** merged CI):

   ```bash
   DEMO_CLEANUP_CONFIRMATION='APPLY yawp_demo' \
     bun scripts/demo/demo-db-cleanup.ts --apply
   ```

## KEEP policy (summary)

- **Students:** Riley Student, Sam Student, Taylor Student — all documents, submissions, grades, tutor threads.
- **Teachers:** Brian demo teacher account(s), Jordan teacher demo, intern QA teachers (Ava Crossman, Thomas Patton).
- **Platform:** owner/admin accounts, dev personas (`dev.*@yawp.local`), intern testers (`bryant+intern*@brock.software`), team inboxes (`brian@`, `bryant@`, `kevin@`, `bbrock@` on approved domains).
- **Orgs:** `local-dev-org`, `university-of-alabama-preview`, any org with `previewSeatCode`, any org with a KEEP member.
- **Ambiguous:** users with substantive multi-paragraph authored docs → KEEP (listed for Bryant).

## DELETE policy (summary)

- Dev-panel **simulated** students (`sim-*@example.test`, `simulatedForClassId` set).
- Students whose **submitted** work is entirely one-line / canned simulation text.
- Throwaway free-tier jump accounts (`dev-panel+…@pending-….example.test`).
- Organizations with **no KEEP members** after user classification (empty or testing-only orgs).

## ASSUMPTION

Demo student display names match local dev personas (`Riley Student`, `Sam Student`, `Taylor Student`) and Jordan teacher appears with a name starting with “Jordan” and role `TEACHER`. If demo uses different emails, update `demo-cleanup-keep.ts` before apply.
