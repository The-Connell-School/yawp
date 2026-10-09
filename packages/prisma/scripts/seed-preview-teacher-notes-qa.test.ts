import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  dailyPagesEngagementRubricSnapshot,
  previewTeacherNotesQaDatabaseAllowed,
} from './seed-preview-teacher-notes-qa';
import { getCategoryScoreBand } from '../../../services/web-app/app/domain/assignment-types/rubric-category-options';

describe('seed-preview-teacher-notes-qa', () => {
  test('dailyPagesEngagementRubricSnapshot scales bands so QA score 24 is Good', () => {
    const snapshot = dailyPagesEngagementRubricSnapshot();
    const category = snapshot.categories[0] as {
      bands?: Array<{ min: number; max: number; label: string }>;
    };
    const band = getCategoryScoreBand(
      { key: 'engagement_with_prompt', label: 'Engagement', bands: category.bands },
      24
    );
    expect(band?.label).toBe('Good');
    expect(snapshot.maxScore).toBe(30);
  });

  test('previewTeacherNotesQaDatabaseAllowed rejects demo and CI database names', () => {
    expect(
      previewTeacherNotesQaDatabaseAllowed(
        'postgresql://postgres:postgres@preview-postgres:5432/yawp_pr_415'
      )
    ).toBe(true);
    expect(
      previewTeacherNotesQaDatabaseAllowed(
        'postgresql://postgres:postgres@preview-postgres:5432/yawp_demo'
      )
    ).toBe(false);
  });

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
    expect(script).toContain('Engagement Check (Preview)');
    expect(script).toContain('PREVIEW_TEACHER_NOTES_QA_ENGAGEMENT_SUBMISSION_TITLE');
    expect(script).toContain('restoreEssayGradedSamplesMutatedByLegacyQaSeed');
    expect(script).toContain('previewTeacherNotesQaDatabaseAllowed');
    expect(script).toContain('failed (non-fatal)');
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
