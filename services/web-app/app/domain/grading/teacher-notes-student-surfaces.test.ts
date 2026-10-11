import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SUBMISSION_GRADE_AND_FEEDBACK_FIELDS } from '~/domain/submissions/student-submission-grade-visibility.server';

const repoRoot = join(import.meta.dir, '../../..');

function readRepoFile(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('teacher notes never reach student export surfaces', () => {
  test('grade and feedback strip lists exclude teacherNote', () => {
    expect(SUBMISSION_GRADE_AND_FEEDBACK_FIELDS).not.toContain('teacherNote');
  });

  test('class grading sheet loader select does not request teacherNote', () => {
    const source = readRepoFile(
      'app/routes/app.my-classes.$classId/route.tsx'
    );
    expect(source).not.toMatch(/teacherNote\s*:/);
  });

  test('student submission and revision loaders only expose teacherNote to staff', () => {
    const submissionLoader = readRepoFile(
      'app/routes/app_.submissions_.$submissionId/route.tsx'
    );
    expect(submissionLoader).toContain('staffTeacherNoteLoaderField');
    expect(submissionLoader).not.toMatch(
      /submission:\s*\{[^}]*teacherNote/s
    );

    const reviseLoader = readRepoFile(
      'app/routes/app_.revise_.$submissionId/route.tsx'
    );
    expect(reviseLoader).not.toContain('teacherNote');
  });
});
