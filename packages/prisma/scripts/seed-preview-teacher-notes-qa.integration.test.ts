import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createPrismaClient } from './local-dev/connection';
import {
  PREVIEW_TEACHER_NOTES_QA_ENGAGEMENT_SUBMISSION_TITLE,
  PREVIEW_TEACHER_NOTES_QA_NOTE,
} from './local-dev/preview-teacher-notes-qa';
import {
  previewTeacherNotesQaDatabaseAllowed,
  seedPreviewTeacherNotesQa,
} from './seed-preview-teacher-notes-qa';

const BASE_DB =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5432/yawp_migration_ci';
const PR_PREVIEW_DB = 'yawp_pr_415';

function databaseUrlForName(databaseName: string) {
  const url = new URL(BASE_DB.replace(/^postgres:/, 'postgresql:'));
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function adminDatabaseUrl() {
  const url = new URL(BASE_DB.replace(/^postgres:/, 'postgresql:'));
  url.pathname = '/postgres';
  return url.toString();
}

function adminPsql(sql: string) {
  const res = spawnSync(
    'psql',
    ['-v', 'ON_ERROR_STOP=1', adminDatabaseUrl(), '-c', sql],
    { encoding: 'utf8' }
  );
  if (res.status !== 0) {
    throw new Error(`admin psql failed: ${res.stderr}\n${res.stdout}`);
  }
}

function templateDatabaseName() {
  const name = new URL(BASE_DB.replace(/^postgres:/, 'postgresql:')).pathname
    .replace(/^\//, '')
    .split('/')[0];
  if (!name) throw new Error('Could not parse template database from DATABASE_URL');
  return name;
}

describe('previewTeacherNotesQaDatabaseAllowed', () => {
  test('allows only yawp_pr_<n> preview databases', () => {
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
    expect(
      previewTeacherNotesQaDatabaseAllowed(
        'postgresql://postgres:postgres@127.0.0.1:5432/yawp_migration_ci'
      )
    ).toBe(false);
    expect(
      previewTeacherNotesQaDatabaseAllowed(
        'postgresql://postgres:postgres@127.0.0.1:5432/yawp_production'
      )
    ).toBe(false);
  });
});

describe('seedPreviewTeacherNotesQa integration', () => {
  const previewUrl = databaseUrlForName(PR_PREVIEW_DB);
  let prisma = createPrismaClient(previewUrl);

  beforeAll(() => {
    const template = templateDatabaseName();
    adminPsql(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${PR_PREVIEW_DB}' AND pid <> pg_backend_pid();`
    );
    adminPsql(`DROP DATABASE IF EXISTS "${PR_PREVIEW_DB}";`);
    adminPsql(`CREATE DATABASE "${PR_PREVIEW_DB}" TEMPLATE "${template}";`);
    prisma = createPrismaClient(previewUrl);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('creates the engagement QA submission and exactly one QA teacher note', async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = previewUrl;
    const result = await seedPreviewTeacherNotesQa(prisma);
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    expect(result.status).toBe('ok');
    expect(result.submissionId).toBeTruthy();

    const engagementSubmission = await prisma.submission.findFirst({
      where: { title: PREVIEW_TEACHER_NOTES_QA_ENGAGEMENT_SUBMISSION_TITLE },
      select: { id: true, score: true, rubricScores: true },
    });
    expect(engagementSubmission?.score).toBe('24/30');
    const scores = engagementSubmission?.rubricScores as Record<
      string,
      { score?: number }
    > | null;
    expect(scores?.engagement_with_prompt?.score).toBe(24);
    expect(scores?.depth_of_thought).toBeUndefined();

    const runsWithQaNote = await prisma.submissionGradingAssistantRun.findMany({
      where: {
        metadata: {
          path: ['teacherNote'],
          equals: PREVIEW_TEACHER_NOTES_QA_NOTE,
        },
      },
      select: { submissionId: true },
    });
    expect(runsWithQaNote).toHaveLength(1);
    expect(runsWithQaNote[0]?.submissionId).toBe(engagementSubmission?.id);

    const caseyRun = await prisma.submissionGradingAssistantRun.findFirst({
      where: {
        submission: {
          title: 'Honest and kind — Casey',
          document: {
            membership: { user: { email: 'dev.student.graded@yawp.local' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    });
    const caseyMeta = caseyRun?.metadata as Record<string, unknown> | null;
    expect(caseyMeta?.teacherNote).toBeUndefined();
    expect(caseyMeta?.output).toBeUndefined();
  });
});
