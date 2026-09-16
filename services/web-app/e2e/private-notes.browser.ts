import { chromium, expect } from '@playwright/test';
import { PrismaClient } from '../../../packages/prisma/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import schema from '../app/domain/rubrics/library/daily-pages-engagement.json';

const database = new URL(process.env.DATABASE_URL!);
assert(['localhost', '127.0.0.1'].includes(database.hostname) && database.pathname.startsWith('/yawp_'));
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: database.toString(), ssl: false }) });
const port = Number(process.env.DEV_PORT);
assert(port > 1024);
const origin = `http://localhost:${port}`;
const dir = process.env.PRIVATE_NOTES_QA_DIR || '/tmp/yawp-private-notes-browser';
mkdirSync(dir, { recursive: true });
const id = `e2e-private-notes-${randomUUID()}`;
const note = 'The final paragraph shifts from short sentences to specialized vocabulary.';
const seed = await db.document.findFirstOrThrow({ where: { membership: { user: { email: 'dev.student@yawp.local' } }, classAssignmentId: { not: null } }, include: { membership: { include: { organization: true } } } });
const org = seed.membership!.organization;
const teacher = await db.orgMembership.findFirstOrThrow({ where: { user: { email: 'dev.teacher@yawp.local' }, organizationId: org.id, role: 'TEACHER' } });
let app: ReturnType<typeof spawn> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await db.organization.update({ where: { id: org.id }, data: { revisionFlowEnabled: true } });
  await db.document.create({ data: { id, title: 'Private notes QA', text: 'My grandmother’s kitchen is where we gather.', html: '<p>My grandmother’s kitchen is where we gather.</p>', membershipId: seed.membershipId, assignmentTypeId: seed.assignmentTypeId, assignmentId: seed.assignmentId, classAssignmentId: seed.classAssignmentId } });
  await db.submission.create({ data: { id, documentId: id, title: 'Private notes QA', text: 'My grandmother’s kitchen is where we gather.', html: '<p>My grandmother’s kitchen is where we gather.</p>', submittedAt: new Date(), gradedAt: new Date(), gradedByMembershipId: teacher.id, overallScore: 18, score: '18/30', overallComment: 'Your kitchen detail makes the memory vivid.', rubricScores: { engagement_with_prompt: { score: 18, comment: '', isAi: true } } } });
  const run = await db.submissionGradingAssistantRun.create({ data: { submissionId: id, source: 'assignment-type', status: 'succeeded', assignmentTypeRubricSnapshot: { categories: schema.rubric.categories, minScore: 0, maxScore: 30, step: 1, scoringType: 'rubric_points' }, metadata: { teacherNote: note, output: { rubricScores: { engagement_with_prompt: { score: 18 } }, overallComment: 'Your kitchen detail makes the memory vivid.', score: '18/30' } } } });
  const log = openSync(join(dir, 'app.log'), 'w', 0o600);
  app = spawn(process.execPath, ['run', 'dev', '--host', 'localhost', '--port', String(port), '--strictPort'], { cwd: process.cwd(), detached: true, stdio: ['ignore', log, log], env: { ...process.env, NODE_ENV: 'development', PREVIEW_ACCESS_GATE: 'off' } });
  closeSync(log);
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (app.exitCode !== null) throw new Error('App exited before startup');
    try { ready = (await fetch(`${origin}/api/healthcheck`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await Bun.sleep(500);
  }
  assert(ready);
  browser = await chromium.launch({ headless: true });
  const staff = await browser.newContext({ recordVideo: { dir } });
  const page = await staff.newPage();
  const videoStartedAt = Date.now();
  const prepared = process.env.PRIVATE_NOTES_QA_NARRATION
    ? JSON.parse(readFileSync(process.env.PRIVATE_NOTES_QA_NARRATION, 'utf8'))
    : null;
  const markers: Array<{ index: number; start: number }> = [];
  const narrateVisible = async (index: number) => {
    if (!prepared) return;
    const cue = prepared.cues.find((item: { index: number }) => item.index === index);
    assert(cue && cue.duration > 0, `Missing narration cue ${index}`);
    markers.push({ index, start: (Date.now() - videoStartedAt) / 1000 });
    await page.waitForTimeout(Math.ceil((cue.duration + 1) * 1000));
  };
  await page.goto(`${origin}/auth/login`);
  await page.evaluate(async () => { const response = await fetch('/auth/dev-login', { method: 'POST', body: new URLSearchParams({ email: 'dev.teacher@yawp.local' }) }); if (!response.ok) throw new Error('Teacher dev login failed'); });
  await page.goto(`${origin}/app/submissions/${id}`);
  const notes = page.getByRole('region', { name: 'Teacher Context' });
  await expect(notes).toContainText(note, { timeout: 10000 });
  await page.reload();
  await expect(notes).toContainText(note);
  await page.screenshot({ path: join(dir, 'teacher-before-release.png'), fullPage: true });
  await narrateVisible(1);
  const student = await browser.newContext();
  const studentPage = await student.newPage();
  await studentPage.goto(`${origin}/auth/login`);
  await studentPage.evaluate(async () => { const response = await fetch('/auth/dev-login', { method: 'POST', body: new URLSearchParams({ email: 'dev.student@yawp.local' }) }); if (!response.ok) throw new Error('Student dev login failed'); });
  for (const phase of ['unreleased', 'released']) {
    if (phase === 'released') {
      await page.getByTestId('submission-lifecycle-release').click();
      await page.getByRole('button', { name: 'Release', exact: true }).click();
      await expect(page.getByTestId('submission-lifecycle-release')).toHaveCount(0);
      await page.reload();
      await expect(notes).toContainText(note);
      await page.screenshot({ path: join(dir, 'teacher-after-release.png'), fullPage: true });
      await narrateVisible(2);
    }
    const response = await studentPage.goto(`${origin}/app/submissions/${id}`);
    assert(!(await response!.text()).includes(note), `${phase} HTML must omit private notes`);
    const data = await studentPage.evaluate(async (path) => (await fetch(path)).text(), `/app/submissions/${id}.data`);
    assert(!data.includes(note), `${phase} loader data must omit private notes`);
    await expect(studentPage.getByRole('region', { name: 'Teacher Context' })).toHaveCount(0);
    await studentPage.screenshot({ path: join(dir, `student-${phase}.png`), fullPage: true });
  }
  const revision = await studentPage.goto(`${origin}/app/revise/${id}`);
  assert(!(await revision!.text()).includes(note), 'Student revision HTML must omit private note');
  assert(!(await studentPage.evaluate(async (path) => (await fetch(path)).text(), `/app/revise/${id}.data`)).includes(note), 'Student revision loader data must omit private note');
  const forbidden = await studentPage.evaluate(async (id) => (await fetch('/api/domain/grade-essay-ai', { method: 'POST', body: new URLSearchParams({ submissionId: id }) })).status, id);
  assert.equal(forbidden, 403, 'Student cannot generate or read private notes from grading action');
  await db.submissionGradingAssistantRun.create({ data: { submissionId: id, source: 'assignment-type', status: 'succeeded', assignmentTypeRubricSnapshot: run.assignmentTypeRubricSnapshot!, metadata: { teacherNote: null } } });
  await page.reload();
  await expect(notes).toHaveCount(0);
  await page.screenshot({ path: join(dir, 'teacher-empty-note.png'), fullPage: true });
  await narrateVisible(3);
  if (prepared) writeFileSync(join(dir, 'markers.json'), JSON.stringify(markers, null, 2) + '\n');
  await staff.close(); await student.close();
  console.log(JSON.stringify({ status: 'passed', proof: ['teacher-visible', 'teacher-reload', 'release-preserved', 'student-before-and-after-release-private', 'student-revision-private', 'student-action-forbidden', 'empty-latest-note-hidden'], artifacts: dir }));
} finally {
  await browser?.close();
  if (app?.pid) { try { process.kill(-app.pid, 'SIGTERM'); } catch {} }
  // Release writes immutable audit rows. Retain their referenced fixture and
  // archive only this run's disposable artifact instead of deleting the audit.
  await db.submission.updateMany({ where: { id }, data: { archivedAt: new Date() } });
  await db.document.updateMany({ where: { id }, data: { deletedAt: new Date() } });
  await db.organization.update({ where: { id: org.id }, data: { revisionFlowEnabled: org.revisionFlowEnabled } });
  await db.$disconnect();
}
