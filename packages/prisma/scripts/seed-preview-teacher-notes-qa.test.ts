import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('seed-preview-teacher-notes-qa', () => {
  test('is wired only for preview seed deploys and guards non-seed modes', () => {
    const script = readFileSync(
      join(import.meta.dir, 'seed-preview-teacher-notes-qa.ts'),
      'utf8'
    );
    expect(script).toContain('shouldRunPreviewTeacherNotesQaSeed');
    expect(script).toContain('assertLocalSeedTarget');
    expect(script).not.toContain('production-qa-profile-remote');
    expect(script).not.toContain('MANAGEMENT');
    expect(script).not.toContain('LOCAL_DEV_PASSWORD');
    expect(script).toContain('PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_PASSWORD');
  });

  test('preview deploy runs the seed after class starter', () => {
    const deploy = readFileSync(
      join(import.meta.dir, '../../../scripts/preview/deploy.sh'),
      'utf8'
    );
    expect(deploy).toContain('bun run seed-preview-teacher-notes-qa');
    const seats = readFileSync(
      join(import.meta.dir, 'seed-preview-seats.ts'),
      'utf8'
    );
    expect(seats).toContain('seedPreviewTeacherNotesQa');
    const classStarter = deploy.indexOf('bun run seed-class-starter-assignment-type');
    const qaSeed = deploy.indexOf('bun run seed-preview-teacher-notes-qa');
    expect(classStarter).toBeGreaterThan(-1);
    expect(qaSeed).toBeGreaterThan(classStarter);
  });
});
