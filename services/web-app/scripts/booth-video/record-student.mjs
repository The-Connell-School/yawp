/**
 * Records the "student and feedback" cut of the demo video, one clip per
 * shot: what students and teachers see while Yawp! serves students, from the
 * first draft to a revised, regraded second version. No Lesson Planner.
 *
 *   node scripts/booth-video/record-student.mjs [--only document,steps] [--out dir]
 *
 * Run inside an X display after run.sh has started the stand-in model server
 * and the app (BOOTH_CUT=student bash run.sh does all of it). Segments run in
 * story order and depend on the state earlier ones leave behind.
 */
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closingPunchlineCard, closingQrCard, closingStackCard, openingCard, SECTION_COLORS, sectionCard } from './cards.mjs';
import * as base from './copy.mjs';
import * as copy from './copy-student.mjs';
import { go, launch, loginAs, Recorder, showCard, sleep, stage } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : args[i + 1]; };
const only = opt('only')?.split(',');
const outDir = opt('out') ?? path.join(process.env.TMPDIR ?? os.tmpdir(), 'booth-video', 'clips-student');

const { SECTIONS, TOTAL_SECTIONS, VO } = copy;
const { context, page } = await launch(path.join(os.tmpdir(), 'booth-video-profile'));
const rec = new Recorder(outDir);
const s = stage(page);
const { booth } = s;

const color = (section) => SECTION_COLORS[(section.n - 1) % SECTION_COLORS.length].accent;

async function titleCard(section, holdMs = 2600) {
  await showCard(page, sectionCard({ ...section, total: TOTAL_SECTIONS }));
  await rec.start(`title-${section.n}`);
  await sleep(holdMs);
  await rec.stop();
}

/** Signs in, opens the page and sets the section chip before recording starts. */
async function enter(section, email, url) {
  await loginAs(context, email);
  await go(page, url);
  await s.dockCaption(null);
  await s.chapter(section, TOTAL_SECTIONS, color(section));
}

function boothState() {
  const out = execFileSync('bun', [path.join(here, 'state.ts')], { encoding: 'utf8', env: process.env });
  return JSON.parse(out.trim().split('\n').pop());
}

const tutorMessages = () => page.locator('[data-tutor-message="true"]');
async function nextTutorReply(before) {
  await page.waitForFunction((n) => document.querySelectorAll('[data-tutor-message="true"]').length > n, before, { timeout: 30000 });
  await sleep(600);
  return tutorMessages().last();
}
/** Clicks one of the tutor's own step buttons ("Ready!", "Give me feedback!") and waits for what follows. */
async function tutorButton(name, { reply = true } = {}) {
  const before = await tutorMessages().count();
  await s.click(page.getByRole('button', { name, exact: true }).last(), { after: 0 });
  if (!reply) { await sleep(900); return null; }
  return nextTutorReply(before);
}

const segments = {
  async open() {
    await showCard(page, openingCard(copy.OPENING_CARD));
    await rec.start('opening');
    await sleep(5000);
    await rec.stop();
  },

  /** Off camera: Ms. Rivera assigns the essay, and the classmates hand theirs in. */
  async setup() {
    await loginAs(context, base.TEACHER.email);
    await go(page, '/app');
    await page.locator('a:has-text("The Thesis-Driven Essay")').first().click();
    await page.waitForLoadState('networkidle');
    await page.locator('[data-tour="type-new"]').first().click();
    await page.locator('[role="menuitem"]:has-text("Generate a prompt")').first().click();
    await page.getByPlaceholder("Describe the prompt you want or just say what you're teaching").fill(base.PROMPT_REQUEST);
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Use this prompt' }).click({ timeout: 30000 });
    const title = page.locator('#assignment-create-title');
    await title.waitFor();
    if (!(await title.inputValue())) await title.fill(base.ASSIGNMENT.title);
    await page.locator('label[for^="assignment-create-class-"]', { hasText: base.CLASS.title }).click();
    await page.getByRole('button', { name: 'Create Assignment' }).click();
    await page.getByText('Share with students').first().waitFor({ timeout: 15000 });
    console.log(execFileSync('bun', [path.join(here, 'seed-booth.ts'), 'class-work'], { encoding: 'utf8', env: process.env }).trim());
  },

  async document() {
    const section = SECTIONS.document;
    await titleCard(section);
    await enter(section, base.STUDENT.email, '/app');
    await rec.start('document');
    await s.caption(VO.document.open, { hold: false });
    await sleep(500);
    await s.click(page.locator(`a:has-text("${base.CLASS.title}")`).first(), { after: 0 });
    await page.waitForURL(/\/app\/my-classes\//);
    await page.waitForLoadState('networkidle');
    const card = page.locator('button:has-text("Fahrenheit 451")').first();
    await s.moveTo(card, 800);
    await sleep(600);
    await s.click(card, { after: 0 });
    await page.waitForURL(/\/app\/documents\//);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    const editor = page.locator('.ProseMirror').first();
    await s.dockCaption(editor);
    await s.clearCaption();
    await sleep(500);
    await s.callout(page.getByText(base.ASSIGNMENT.prompt.slice(0, 40)).first(), { ...VO.document.layout, side: 'bottom', dim: false, holdMs: 4600 });
    await s.clearCallout();

    await s.caption(VO.document.prewrite, { hold: false });
    await s.badge('Time-lapse');
    await s.click(editor, { after: 200 });
    for (const [i, line] of base.PREWRITING.entries()) {
      const bullet = line.startsWith('- ');
      const inList = i > 0 && base.PREWRITING[i - 1].startsWith('- ');
      if (i > 0) await page.keyboard.press('Enter');
      if (inList && !bullet) await page.keyboard.press('Enter');
      await page.keyboard.type(inList && bullet ? line.slice(2) : line, { delay: 4 });
    }
    await s.badge('');
    await sleep(600);

    await s.caption(VO.document.feedback, { hold: false });
    let reply = await tutorButton('Give me feedback!');
    await sleep(1000);
    await s.callout(reply, { ...VO.document.feedbackCallout, side: 'right', dim: false, holdMs: 5200 });
    await s.clearCallout();

    await s.caption(VO.document.backAndForth, { hold: false });
    await s.click('[data-testid="tutor-chat-open"]', { after: 400 });
    await s.type('[data-testid="tutor-chat-input"]', base.STUDENT_REPLY_1, { delay: 24 });
    let before = await tutorMessages().count();
    await s.click('[data-testid="tutor-chat-send"]', { after: 0 });
    await nextTutorReply(before);
    await sleep(4000);
    await rec.stop();

    await rec.start('refusal');
    await s.clearCaption();
    await s.type('[data-testid="tutor-chat-input"]', base.STUDENT_ASKS_TO_WRITE, { delay: 30 });
    await sleep(300);
    await s.callout('[data-testid="tutor-chat-input"]', { ...VO.document.asks, eyebrow: 'Watch this', side: 'right', step: 0, steps: 3, holdMs: 3800 });
    await s.clearCallout();
    before = await tutorMessages().count();
    await s.click('[data-testid="tutor-chat-send"]', { after: 0 });
    reply = await nextTutorReply(before);
    await sleep(1200);
    await s.callout(reply, { ...VO.document.refusal, side: 'right', step: 1, steps: 3, holdMs: 10500 });
    await s.callout(null, { ...VO.document.point, step: 2, steps: 3, holdMs: 5200 });
    await s.clearCallout();
    await rec.stop();
  },

  async steps() {
    const section = SECTIONS.steps;
    const state = boothState();
    await titleCard(section);
    await enter(section, base.STUDENT.email, `/app/documents/${state.documentId}`);
    await page.evaluate(() => document.fonts.ready);
    const editor = page.locator('.ProseMirror').first();
    const nextStep = page.locator('[data-testid="tutor-next-module"]');
    await s.dockCaption(editor);
    await rec.start('steps');

    // Thesis Statement: she writes it, then asks for feedback on it.
    await s.caption(VO.steps.thesis, { hold: false });
    await s.click(nextStep, { ms: 400, after: 700 });
    await s.caret(editor, 'end');
    await page.keyboard.press('Control+A');
    await page.keyboard.type(copy.THESIS, { delay: 9 });
    await sleep(500);
    await tutorButton('Ready!', { reply: false });
    let reply = await tutorButton('Give me feedback!');
    await sleep(1000);
    await s.callout(reply, { ...VO.steps.thesisCallout, side: 'right', dim: false, holdMs: 5600 });
    await s.clearCallout();

    // Introduction, body paragraphs, conclusion, title: a time-lapse.
    await s.caption(VO.steps.drafting, { hold: false });
    const essay = copy.ESSAY;
    const drafts = [
      async () => { await s.caret(editor, 'start'); await s.write(essay[0].slice(0, essay[0].length - copy.THESIS.length)); },
      async () => { await s.caret(editor, 'end'); await s.write(`\n${essay.slice(1, 4).join('\n')}`); },
      async () => {
        await s.caret(editor, 'end');
        await s.write(`\n${essay[4].slice(0, essay[4].length - base.ESSAY_LAST_SENTENCE.length)}`);
        await s.badge('');
        await page.keyboard.type(base.ESSAY_LAST_SENTENCE, { delay: 18 });
      },
      async () => {
        const titleInput = page.locator('[data-testid="document-title-input"]');
        await titleInput.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.type(copy.ESSAY_TITLE, { delay: 40 });
        await page.keyboard.press('Tab');
      },
    ];
    for (const draft of drafts) {
      await s.click(nextStep, { ms: 350, after: 350 });
      await s.badge('Time-lapse');
      await draft();
      await s.badge('');
      await sleep(450);
    }

    // The review: the tutor reads the whole draft before she submits.
    await s.caption(VO.steps.review, { hold: false });
    await s.click(nextStep, { ms: 400, after: 600 });
    await tutorButton('Ready!', { reply: false });
    reply = await tutorButton('Yes -- review it!');
    await sleep(1200);
    await s.callout(reply, { ...VO.steps.reviewCallout, side: 'right', dim: false, holdMs: 5800 });
    await s.clearCallout();

    await s.caption(VO.steps.fix, { hold: false });
    const vague = editor.getByText(copy.VAGUE_SENTENCE, { exact: false });
    await s.scrollTo(vague, { ms: 700 });
    await s.moveTo(vague, 600);
    await s.select(editor, copy.VAGUE_SENTENCE);
    await sleep(700);
    await page.keyboard.type(copy.VAGUE_FIX, { delay: 26 });
    await sleep(900);

    await s.caption(VO.steps.submit, { hold: false });
    await s.click('[data-testid="document-submit-button"]', { after: 900 });
    await s.click('[data-testid="document-finalize-submit"]', { after: 0 });
    await page.getByText('Submitted!').first().waitFor({ timeout: 15000 });
    await sleep(1500);
    await rec.stop();
    await s.clearCaption();
  },

  async teacherSees() {
    const section = SECTIONS.teacherSees;
    await titleCard(section);
    await enter(section, base.TEACHER.email, '/app');
    const toGrade = page.getByRole('link', { name: /To grade/ }).first();
    await s.scrollTo(toGrade, { ms: 900 });
    await rec.start('teacher-sees');
    await s.caption(VO.teacherSees.open, { hold: false });
    await sleep(1400);
    await s.click(toGrade, { after: 0 });
    await page.waitForURL(/\/app\/documents/);
    await page.waitForLoadState('networkidle');
    await sleep(500);
    await s.click(page.getByRole('row').filter({ hasText: copy.ESSAY_TITLE }).getByText(copy.ESSAY_TITLE).first(), { after: 0 });
    await page.waitForURL(/\/app\/submissions\//);
    await page.waitForLoadState('networkidle');
    await s.dockCaption('[data-testid="submission-essay-scroll"]');
    await s.clearCaption();
    await sleep(500);

    await s.click(page.getByRole('button', { name: 'Pasted text report' }).first(), { after: 700 });
    await s.callout('[data-testid="paste-report-empty"]', { ...VO.teacherSees.paste, side: 'left', dim: false, holdMs: 4400 });
    await s.clearCallout();
    await s.click(page.getByRole('button', { name: 'Comments', exact: true }).first(), { after: 400 });

    await s.caption(VO.teacherSees.viewDocument, { hold: false });
    const submissionUrl = page.url();
    await s.click('[data-testid="submission-view-document"]', { after: 0 });
    await page.waitForURL(/\/app\/documents\//);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await s.dockCaption(null);
    await sleep(900);
    // Back through her steps to Pre-writing, where she asked it to write for her.
    const previous = page.getByRole('button', { name: 'Previous tutor step' }).first();
    for (let i = 0; i < 8; i += 1) {
      if (await page.getByText("I'm not that kind of guy", { exact: false }).count()) break;
      if (!(await previous.isEnabled())) break;
      await s.click(previous, { ms: i === 0 ? 600 : 250, after: 450 });
    }
    const refusal = tutorMessages().filter({ hasText: "not that kind of guy" }).first();
    await s.scrollTo(refusal, { ms: 1000 });
    await s.clearCaption();
    await s.callout(refusal, { ...VO.teacherSees.transcript, side: 'right', holdMs: 6200 });
    await s.clearCallout();
    await rec.stop();
    await go(page, submissionUrl);
  },

  async grading() {
    const section = SECTIONS.grading;
    const state = boothState();
    await titleCard(section);
    await enter(section, base.TEACHER.email, `/app/submissions/${state.submissionId}`);
    const essayRoot = page.locator('[data-testid="submission-essay-scroll"]');
    await s.dockCaption(essayRoot);
    await rec.start('grading');
    await s.caption(VO.grading.run, { hold: false });
    await s.click('[data-testid="grading-assistant-generate"]', { after: 400 });
    const replace = page.getByRole('alertdialog').getByRole('button', { name: 'Replace' });
    if (await replace.isVisible()) await s.click(replace, { after: 0 });
    await page.getByText('Reset Grading Assistant suggestions').first().waitFor({ timeout: 45000 });
    await sleep(500);
    await s.caption(VO.grading.results, { hold: false });
    await s.click(page.getByRole('button', { name: /Evidence\/Support/ }).first(), { after: 2400 });

    const mark = essayRoot.locator('.grammar-issue-mark').filter({ hasText: 'book clubs' }).first();
    await mark.waitFor({ timeout: 15000 });
    await s.moveTo(mark, 800);
    await mark.hover();
    const note = page.locator('div.fixed.border-purple-200').first();
    await note.waitFor({ timeout: 5000 });
    await sleep(300);
    await s.callout(note, { ...VO.grading.grammarCallout, side: 'right', dim: false, holdMs: 4600 });
    await s.clearCallout();
    await page.mouse.move(5, 5);

    // A margin comment on Maya's sentence.
    await s.caption(VO.grading.comment, { hold: false });
    const target = essayRoot.getByText(copy.MARGIN_COMMENT_ON, { exact: false }).first();
    await s.moveTo(target, 700);
    await s.select(essayRoot, copy.MARGIN_COMMENT_ON);
    await sleep(500);
    await s.click(page.getByRole('button', { name: 'Comment', exact: true }).first(), { after: 500 });
    const draft = page.getByPlaceholder('Write your comment...');
    await s.type(draft, copy.MARGIN_COMMENT, { delay: 20 });
    await sleep(300);
    await s.click(draft.locator('xpath=..').getByRole('button', { name: 'Save', exact: true }), { after: 1000 });
    const card = page.getByText(copy.MARGIN_COMMENT).first();
    await s.callout(card, { ...VO.grading.commentCallout, side: 'left', dim: false, holdMs: 4600 });
    await s.clearCallout();

    // The teacher has the final say: change a score, add a line of their own.
    await s.click(page.getByRole('combobox').filter({ hasText: 'Proficient' }).first(), { after: 500 });
    await s.click(page.getByRole('option').filter({ hasText: 'Strong' }).first(), { after: 700 });
    const overall = page.getByPlaceholder('Write overall feedback...');
    await overall.scrollIntoViewIfNeeded();
    await s.click(overall, { after: 200 });
    await page.keyboard.press('Control+End');
    await page.keyboard.type(base.TEACHER_EDIT.addToOverall, { delay: 16 });
    await sleep(300);
    await s.callout(overall, { ...VO.grading.editCallout, side: 'right', holdMs: 4600 });
    await s.clearCallout();

    await s.caption(VO.grading.release, { hold: false });
    await s.click(page.getByRole('button', { name: 'Save', exact: true }).last(), { after: 1000 });
    await s.click(page.getByRole('button', { name: 'Release Grade' }).first(), { after: 600 });
    await s.click(page.getByRole('alertdialog').getByRole('button', { name: 'Release' }), { after: 1800 });
    await rec.stop();
    await s.clearCaption();
  },

  async feedback() {
    const section = SECTIONS.feedback;
    await titleCard(section);
    await enter(section, base.STUDENT.email, '/app/my-documents');
    await rec.start('feedback');
    await s.caption(VO.feedback.open, { hold: false });
    await sleep(1400);
    await s.click(page.getByText(copy.ESSAY_TITLE).first(), { after: 0 });
    await page.waitForURL(/\/app\/(submissions|documents)\//);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await sleep(900);

    const evidence = page.getByRole('button', { name: /Evidence/ }).first();
    if (await evidence.count()) {
      await s.click(evidence, { after: 900 });
      await s.callout(evidence.locator('xpath=..'), { ...VO.feedback.rubric, side: 'right', dim: false, holdMs: 4600 });
      await s.clearCallout();
    }

    await s.caption(VO.feedback.margin, { hold: false });
    const comment = page.getByText(copy.MARGIN_COMMENT).first();
    await s.click(comment, { after: 2600 });

    const mark = page.locator('.grammar-issue-mark').filter({ hasText: 'book clubs' }).first();
    if (await mark.count()) {
      await s.moveTo(mark, 700);
      await mark.hover();
      const note = page.locator('div.fixed.border-purple-200').first();
      const shown = await note.waitFor({ timeout: 3000 }).then(() => true, () => false);
      await s.callout(shown ? note : mark, { ...VO.feedback.grammar, side: 'right', dim: false, holdMs: 4200 });
      await s.clearCallout();
      await page.mouse.move(5, 5);
    }

    await s.caption(VO.feedback.revise, { hold: false });
    await s.moveTo('[data-testid="submission-revise-essay"]', 800);
    await sleep(1600);
    await rec.stop();
    await s.clearCaption();
  },

  async revision() {
    const section = SECTIONS.revision;
    const state = boothState();
    await titleCard(section);
    await enter(section, base.STUDENT.email, `/app/submissions/${state.submissionId}`);
    await page.evaluate(() => document.fonts.ready);
    await rec.start('revision');
    await sleep(300);
    await s.click('[data-testid="submission-revise-essay"]', { ms: 500, after: 0 });
    await page.waitForURL(/\/app\/revise\//);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await s.dockCaption('[data-testid="revision-draft-pane"]');
    await s.caption(VO.revision.open, { hold: false });
    await sleep(2200);

    const draft = page.locator('[data-testid="revision-draft-pane"] .ProseMirror');
    await draft.waitFor();
    await s.caption(VO.revision.rewrite, { hold: false });
    await s.moveTo(draft.getByText(base.WEAK_ANALYSIS, { exact: false }), 500);
    await s.select(draft, base.WEAK_ANALYSIS);
    await sleep(400);
    await page.keyboard.type(base.REVISED_ANALYSIS, { delay: 5 });
    await sleep(1200);

    await s.caption(VO.revision.splice, { hold: false });
    await s.moveTo(draft.getByText(copy.SPLICE_FIX.from, { exact: false }), 450);
    await s.select(draft, copy.SPLICE_FIX.from);
    await sleep(300);
    await page.keyboard.type(copy.SPLICE_FIX.to, { delay: 25 });
    await sleep(700);

    await s.click('[data-testid="revision-submit"]', { ms: 500, after: 500 });
    await s.click('[data-testid="revision-submit-confirm"]', { ms: 450, after: 800 });
    await s.dockCaption(null);
    await s.caption(VO.revision.submit);
    await rec.stop();
    await s.clearCaption();
  },

  async summary() {
    const section = SECTIONS.summary;
    const state = boothState();
    await titleCard(section);
    await enter(section, base.TEACHER.email, `/app/my-classes/${state.classId}/assignments/${state.assignmentId}`);
    await rec.start('summary');
    await s.caption(VO.summary.open, { hold: false });
    await sleep(1200);
    await s.caption(VO.summary.run, { hold: false });
    await s.click('[data-testid="class-insight-generate-button"]', { after: 0 });
    await page.getByText('How the class did').first().waitFor({ timeout: 45000 });
    await sleep(700);
    await s.callout(null, { ...VO.summary.neverBefore, holdMs: 5600 });
    await s.clearCallout();
    await s.clearCaption();
    await s.scrollTo(page.getByText('How the class did').first(), { block: 'start', ms: 1300 });
    const evidenceCard = page.locator('div', { has: page.getByText('Needs work', { exact: true }) }).filter({ hasText: 'Show student examples' }).last();
    await s.callout(evidenceCard, { ...VO.summary.pattern, side: 'top', holdMs: 4800 });
    await s.clearCallout();
    const groups = page.getByText('Differentiation starting points').first();
    if (await groups.count()) {
      await s.caption(VO.summary.groups, { hold: false });
      await s.scrollTo(groups, { block: 'start', ms: 1300 });
      await sleep(3200);
    }
    await rec.stop();
    await s.clearCaption();
  },

  async reporter() {
    const section = SECTIONS.reporter;
    await titleCard(section);
    await enter(section, base.TEACHER.email, '/app/reporter');
    await page.waitForLoadState('networkidle');
    const prompt = page.getByPlaceholder(/Ask Yawp!? Reporter/);
    const composer = page.locator('form', { has: prompt }).first();
    const top = (await composer.boundingBox()).y;
    const viewHeight = await page.evaluate(() => innerHeight);
    await s.dockCaption(composer, { bottom: Math.round(viewHeight - top + 18) });
    await rec.start('reporter');
    await s.caption(VO.reporter.ask, { hold: false });
    await sleep(3000);
    await s.clearCaption();
    await s.callout(prompt, { ...VO.reporter.askCallout, side: 'top', dim: false, holdMs: 500 });
    await s.type(prompt, base.REPORTER_REQUEST, { delay: 30 });
    await sleep(1100);
    await s.clearCallout();
    await page.keyboard.press('Enter');
    const reply = page.locator('[data-role="assistant"]').last();
    await reply.locator('table').first().waitFor({ timeout: 45000 });
    await sleep(900);
    const table = reply.locator('table').first();
    await s.scrollTo(table, { block: 'center', ms: 900 });
    await s.callout(table, { ...VO.reporter.table, side: 'right', dim: false, holdMs: 4600 });
    await s.clearCallout();
    await s.caption(VO.reporter.writing, { hold: false });
    await s.scrollTo(reply.getByRole('heading', { name: 'The Writing' }), { block: 'start', ms: 1200 });
    await sleep(3400);
    await s.caption(VO.reporter.share, { hold: false });
    await sleep(3000);
    await rec.stop();
    await s.clearCaption();
    await s.dockCaption(null);
  },

  async close() {
    await showCard(page, closingStackCard({ lines: copy.CLOSING_STACK }));
    await rec.start('closing-1');
    await page.evaluate(() => document.body.classList.add('play'));
    await sleep(1500 * (copy.CLOSING_STACK.length - 1) + 4000);
    await rec.stop();
    await showCard(page, closingPunchlineCard({ line: base.CLOSING_PUNCHLINE }));
    await rec.start('closing-2');
    await sleep(4700);
    await rec.stop();
    await showCard(page, closingQrCard({ codes: base.CLOSING_QR, url: base.CLOSING_CARD.url, disclosure: base.DISCLOSURE }));
    await rec.start('closing-3');
    await sleep(7800);
    await rec.stop();
  },
};

const order = ['open', 'setup', 'document', 'steps', 'teacherSees', 'grading', 'feedback', 'revision', 'summary', 'reporter', 'close'];
try {
  for (const name of order) {
    if (only && !only.includes(name)) continue;
    console.log(`[record] ${name}`);
    await segments[name]();
  }
} catch (error) {
  await rec.stop().catch(() => {});
  await page.screenshot({ path: path.join(outDir, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await context.close();
}
console.log(JSON.stringify({ clips: rec.clips }));
