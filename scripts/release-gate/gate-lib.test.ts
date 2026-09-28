import { describe, expect, test } from 'bun:test';
import {
  checkMigrationSafety,
  checkTestsAlongsideSource,
  scanFeatureFlagGuards,
  checkPrBodySections,
} from './gate-lib.mjs';

describe('release gate library', () => {
  test('flags destructive and risky migration SQL', () => {
    const changed = [
      { status: 'A', file: 'packages/prisma/migrations/20260928120000_drop_stuff/migration.sql' },
      { status: 'A', file: 'packages/prisma/migrations/20260928120100_safe_add/migration.sql' },
    ];
    const read = (p: string) => {
      if (p.includes('drop_stuff')) return 'DROP TABLE "Scores";';
      return `
        -- Safer migration, but illegal UPDATE for grades
        UPDATE "Grades" SET "points" = 10;
      `;
    };
    const reasons = checkMigrationSafety(changed, read);
    expect(reasons.map((r) => r.kind)).toContain('migration_destructive_sql');
    expect(reasons.map((r) => r.kind)).toContain('migration_updates_grades_scores_rubrics');
  });

  test('requires tests alongside source changes', () => {
    const changed = [
      { status: 'M', file: 'services/web-app/app/routes/app.assignments.$id/route.tsx' },
      { status: 'M', file: 'docs/notes.md' },
    ];
    const reasons = checkTestsAlongsideSource(changed);
    expect(reasons.map((r) => r.kind)).toEqual(['no_tests_changed']);
  });

  test('allows safe change when tests present', () => {
    const changed = [
      { status: 'M', file: 'services/web-app/app/routes/app.assignments.$id/route.tsx' },
      { status: 'A', file: 'services/web-app/app/routes/app.assignments.$id/route.test.ts' },
    ];
    const reasons = checkTestsAlongsideSource(changed);
    expect(reasons).toEqual([]);
  });

  test('detects added feature usage without server guard (PR like #355)', () => {
    const diff = `
diff --git a/services/web-app/app/routes/app.my-classes.$classId/route.tsx b/services/web-app/app/routes/app.my-classes.$classId/route.tsx
index 1111111..2222222 100644
--- a/services/web-app/app/routes/app.my-classes.$classId/route.tsx
+++ b/services/web-app/app/routes/app.my-classes.$classId/route.tsx
@@
+  // apply rubric at grading time
+  if (membership && membership.organization && membership.organization.writingPracticeEnabled) {
+     // grading path
+  }
`;
    const readFile = (_: string) => `
      export async function action() {
        // Missing guard early in action body; feature check appears only in UI,
        // not as a server-side gate before work.
        return null;
      }
    `;
    const reasons = scanFeatureFlagGuards('origin/main', { diffText: diff, readFile });
    expect(reasons.map((r) => r.kind)).toContain('missing_server_flag_guard');
  });

  test('PR body must include Risks and Rollback sections', () => {
    const missing = checkPrBodySections('This PR changes some stuff.\n\nRisks: Low\n\n'); // no Rollback:
    expect(missing.map((r) => r.kind)).toEqual(['pr_missing_rollback_section']);
  });
});

