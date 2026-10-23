/**
 * Records the booth video, one clip per shot, into --out (default
 * $TMPDIR/booth-video/clips). Run inside an X display, after run.sh has
 * started the stand-in model server and the app:
 *
 *   node scripts/booth-video/record.mjs [--only assign,student] [--out dir]
 *
 * Segments run in story order and depend on the state earlier ones leave
 * behind (the assignment, Maya's essay, her grade), so --only is for
 * iterating on one segment against a database that already has that state.
 */
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closingCard, openingCard, SECTION_COLORS, sectionCard } from './cards.mjs';
import * as copy from './copy.mjs';
import { go, launch, loginAs, Recorder, showCard, sleep, stage } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : args[i + 1]; };
const only = opt('only')?.split(',');
const outDir = opt('out') ?? path.join(process.env.TMPDIR ?? os.tmpdir(), 'booth-video', 'clips');

const { SECTIONS, TOTAL_SECTIONS, VO } = copy;
const { context, page } = await launch(path.join(os.tmpdir(), 'booth-video-profile'));
const rec = new Recorder(outDir);
const s = stage(page);
const { booth } = s;

/** A title card for a section, held for its read time. */
async function titleCard(section, holdMs = 3300) {
  await showCard(page, sectionCard({ ...section, total: TOTAL_SECTIONS }));
  await rec.start(`title-${section.n}`);
  await sleep(holdMs);
  await rec.stop();
}

async function as(email) {
  await loginAs(context, email);
}

/** The booth class, the latest assignment in it, and the featured student's document. */
function boothState() {
  const out = execFileSync('bun', [path.join(here, 'state.ts')], { encoding: 'utf8', env: process.env });
  return JSON.parse(out.trim().split('\n').pop());
}

const segments = {
  async open() {
    await showCard(page, openingCard(copy.OPENING_CARD));
    await rec.start('opening');
    await sleep(6500);
    await rec.stop();
  },

  async assign() {
    await titleCard(SECTIONS.assign);
    await as(copy.TEACHER.email);
    await go(page, '/app');
    await s.chapter(SECTIONS.assign, TOTAL_SECTIONS, SECTION_COLORS[SECTIONS.assign.n - 1].accent);
    await rec.start('assign');
    await s.caption(VO.assign.dashboard, { hold: false });
    await s.moveTo('a:has-text("The Thesis-Driven Essay")', 1200);
    await sleep(1800);
    await s.click('a:has-text("The Thesis-Driven Essay")', { after: 1500 });
    await page.waitForLoadState('networkidle');

    await s.click('[data-tour="type-new"]', { after: 500 });
    await s.click('[role="menuitem"]:has-text("Generate a prompt")', { after: 900 });
    // The sheet covers the right side; keep the caption over the dimmed page.
    await booth('captionDock', { left: 30, width: 800 });
    await s.caption(VO.assign.generate, { hold: false });
    const ask = page.getByPlaceholder("Describe the prompt you want or just say what you're teaching");
    await s.type(ask, copy.PROMPT_REQUEST, { delay: 22 });
    await sleep(400);
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Use this prompt' }).waitFor({ timeout: 30000 });
    await sleep(1200);
    await s.callout(page.getByText(copy.ASSIGNMENT.title).first(), { ...VO.assign.generateCallout, side: 'left', dim: false, holdMs: 5500 });
    await s.clearCallout();
    await s.click(page.getByRole('button', { name: 'Use this prompt' }), { after: 1200 });

    await s.caption(VO.assign.sheet, { hold: false });
    const title = page.locator('#assignment-create-title');
    if (!(await title.inputValue())) await s.type(title, copy.ASSIGNMENT.title, { delay: 18 });
    await s.click(page.locator('label[for^="assignment-create-class-"]', { hasText: copy.CLASS.title }), { after: 700 });
    // The tutor checkbox's row: the checkbox, its label and the cold-write note.
    const tutorRow = page.locator('div', { has: page.locator('#assignment-create-tutor-enabled') }).filter({ hasText: 'Tutor enabled' }).last();
    await s.scrollTo(tutorRow, { ms: 1200 });
    await s.callout(tutorRow, { ...VO.assign.tutorCallout, side: 'left', holdMs: 5500 });
    await s.clearCallout();
    await s.click(page.getByRole('button', { name: 'Create Assignment' }), { after: 1500 });
    await s.dockCaption(null);
    await go(page, `/app/my-classes/${boothState().classId}`);
    await s.caption(VO.assign.sent);
    await rec.stop();
    await s.clearCaption();
    // The rest of the class hands in their essays on the assignment just sent.
    console.log(execFileSync('bun', [path.join(here, 'seed-booth.ts'), 'class-work'], { encoding: 'utf8', env: process.env }).trim());
  },
};

const tutorMessages = () => page.locator('[data-tutor-message="true"]');

/** Waits for the tutor's next reply and lets the bubble settle on screen. */
async function nextTutorReply(before) {
  await page.waitForFunction((n) => document.querySelectorAll('[data-tutor-message="true"]').length > n, before, { timeout: 30000 });
  await sleep(600);
  return tutorMessages().last();
}

segments.student = async () => {
  await titleCard(SECTIONS.student);
  await as(copy.STUDENT.email);
  await go(page, `/app/my-classes/${boothState().classId}`);
  await s.dockCaption(null);
  await s.chapter(SECTIONS.student, TOTAL_SECTIONS, SECTION_COLORS[SECTIONS.student.n - 1].accent);
  await rec.start('student-open');
  await s.caption(VO.student.open, { hold: false });
  const card = page.locator('button:has-text("Fahrenheit 451")').first();
  await s.moveTo(card, 900);
  await sleep(1200);
  await s.click(card, { after: 0 });
  await page.waitForURL(/\/app\/documents\//);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  const editor = page.locator('.ProseMirror').first();
  await s.dockCaption(editor);
  await s.caption(VO.student.tutorBuiltIn);

  // Pre-writing, as a time-lapse: real keystrokes, just fast.
  await s.caption(VO.student.timelapse, { hold: false });
  await s.badge('Time-lapse');
  await s.click(editor, { after: 200 });
  // "- " starts a bulleted list and Enter continues it, so only the first
  // bullet is typed with its dash; a second Enter leaves the list.
  for (const [i, line] of copy.PREWRITING.entries()) {
    const bullet = line.startsWith('- ');
    const inList = i > 0 && copy.PREWRITING[i - 1].startsWith('- ');
    if (i > 0) await page.keyboard.press('Enter');
    if (inList && !bullet) await page.keyboard.press('Enter');
    await page.keyboard.type(inList && bullet ? line.slice(2) : line, { delay: 7 });
  }
  await s.badge('');
  await sleep(1200);

  await s.caption(VO.student.feedback, { hold: false });
  let before = await tutorMessages().count();
  await s.click(page.getByRole('button', { name: 'Give me feedback!' }), { after: 0 });
  let reply = await nextTutorReply(before);
  await sleep(2500);
  await s.callout(reply, { ...VO.student.feedbackCallout, side: 'right', dim: false, holdMs: 6000 });
  await s.clearCallout();

  await s.caption(VO.student.backAndForth, { hold: false });
  await s.click('[data-testid="tutor-chat-open"]', { after: 400 });
  await s.type('[data-testid="tutor-chat-input"]', copy.STUDENT_REPLY_1, { delay: 24 });
  before = await tutorMessages().count();
  await s.click('[data-testid="tutor-chat-send"]', { after: 0 });
  await nextTutorReply(before);
  await sleep(6500);
  await rec.stop();

  // The refusal: its own clip, so it can be held and re-cut on its own.
  await rec.start('student-refusal');
  await s.clearCaption();
  await s.type('[data-testid="tutor-chat-input"]', copy.STUDENT_ASKS_TO_WRITE, { delay: 30 });
  await sleep(300);
  await s.callout('[data-testid="tutor-chat-input"]', { ...VO.student.asks, eyebrow: 'Watch this', side: 'right', step: 0, steps: 3, holdMs: 4500 });
  await s.clearCallout();
  before = await tutorMessages().count();
  await s.click('[data-testid="tutor-chat-send"]', { after: 0 });
  reply = await nextTutorReply(before);
  await sleep(1800);
  await s.callout(reply, { ...VO.student.refusal, side: 'right', step: 1, steps: 3, holdMs: 8500 });
  await s.callout(null, { ...VO.student.point, step: 2, steps: 3, holdMs: 6500 });
  await s.clearCallout();
  await rec.stop();

  // The tutor through each step while the essay comes together (a time-lapse).
  await rec.start('student-steps');
  await s.caption(VO.student.steps, { hold: false });
  const nextStep = page.locator('[data-testid="tutor-next-module"]');
  const steps = [
    async () => { await s.caret(editor, 'end'); await page.keyboard.press('Control+A'); await s.write(copy.THESIS); },
    async () => { await s.caret(editor, 'start'); await s.write(copy.ESSAY[0].slice(0, copy.ESSAY[0].length - copy.THESIS.length)); },
    async () => { await s.caret(editor, 'end'); await s.write(`\n${copy.ESSAY.slice(1, 4).join('\n')}`); },
    async () => { await s.caret(editor, 'end'); await s.write(`\n${copy.ESSAY[4].slice(0, copy.ESSAY[4].length - copy.ESSAY_LAST_SENTENCE.length)}`); },
    async () => {
      const titleInput = page.locator('[data-testid="document-title-input"]');
      await titleInput.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type(copy.ESSAY_TITLE, { delay: 40 });
      await page.keyboard.press('Tab');
    },
  ];
  for (const [i, write] of steps.entries()) {
    await s.click(nextStep, { ms: 450, after: 700 });
    if (i === 0) {
      await s.callout(page.locator('[data-tutor-message="true"]').last(), { ...VO.student.stepsCallout, side: 'right', dim: false, holdMs: 3800 });
      await s.clearCallout();
    }
    await s.badge('Time-lapse');
    await write();
    await s.badge('');
    await sleep(1300);
  }
  await s.caret(editor, 'end');
  await page.keyboard.type(copy.ESSAY_LAST_SENTENCE, { delay: 32 });
  await sleep(800);
  await s.caption(VO.student.submit, { hold: false });
  await s.click('[data-testid="document-submit-button"]', { after: 900 });
  await s.click('[data-testid="document-finalize-submit"]', { after: 0 });
  await page.getByText('Submitted!').first().waitFor({ timeout: 15000 });
  await sleep(2500);
  await rec.stop();
  await s.clearCaption();
};

segments.grading = async () => {
  const state = boothState();
  await titleCard(SECTIONS.grading);
  await as(copy.TEACHER.email);
  await go(page, '/app');
  await s.dockCaption(null);
  await s.chapter(SECTIONS.grading, TOTAL_SECTIONS, SECTION_COLORS[SECTIONS.grading.n - 1].accent);
  const toGrade = page.getByRole('link', { name: /To grade/ }).first();
  await s.scrollTo(toGrade, { ms: 900 });
  await rec.start('grading');
  await s.caption(VO.grading.open, { hold: false });
  await s.callout(toGrade, { ...VO.grading.openCallout, side: 'top', holdMs: 3800 });
  await s.clearCallout();
  await s.click(toGrade, { after: 0 });
  await page.waitForURL(/\/app\/documents/);
  await page.waitForLoadState('networkidle');
  await sleep(1200);
  await s.click(page.getByRole('row').filter({ hasText: copy.ESSAY_TITLE }).getByText(copy.ESSAY_TITLE).first(), { after: 0 });
  await page.waitForURL(/\/app\/submissions\//);
  await page.waitForLoadState('networkidle');
  await s.dockCaption('[data-testid="submission-essay-scroll"]');
  await sleep(1500);

  await s.caption(VO.grading.run, { hold: false });
  await s.click('[data-testid="grading-assistant-generate"]', { after: 400 });
  const replace = page.getByRole('alertdialog').getByRole('button', { name: 'Replace' });
  if (await replace.isVisible()) await s.click(replace, { after: 0 });
  await page.getByText('Reset Grading Assistant suggestions').first().waitFor({ timeout: 45000 });
  await sleep(1200);
  await s.caption(VO.grading.results, { hold: false });
  const evidence = page.getByRole('button', { name: /Evidence\/Support/ }).first();
  await s.click(evidence, { after: 1200 });
  await sleep(3500);

  // The teacher has the final say: change a score, add a line of their own.
  const scoreSelect = page.getByRole('combobox').filter({ hasText: 'Proficient' }).first();
  await s.click(scoreSelect, { after: 500 });
  await s.click(page.getByRole('option').filter({ hasText: 'Strong' }).first(), { after: 700 });
  const overall = page.getByPlaceholder('Write overall feedback...');
  await overall.scrollIntoViewIfNeeded();
  await s.click(overall, { after: 200 });
  await page.keyboard.press('Control+End');
  await page.keyboard.type(copy.TEACHER_EDIT.addToOverall, { delay: 26 });
  await sleep(500);
  await s.callout(overall, { ...VO.grading.editCallout, side: 'right', holdMs: 6500 });
  await s.clearCallout();

  await s.caption(VO.grading.release, { hold: false });
  await s.click(page.getByRole('button', { name: 'Save', exact: true }), { after: 1500 });
  await s.click(page.getByRole('button', { name: 'Release Grade' }).first(), { after: 800 });
  await s.click(page.getByRole('alertdialog').getByRole('button', { name: 'Release' }), { after: 2500 });
  await rec.stop();
  await s.clearCaption();
};

segments.revision = async () => {
  const state = boothState();
  await titleCard(SECTIONS.revision);
  await as(copy.STUDENT.email);
  await go(page, `/app/documents/${state.documentId}`);
  await s.dockCaption(null);
  await s.chapter(SECTIONS.revision, TOTAL_SECTIONS, SECTION_COLORS[SECTIONS.revision.n - 1].accent);
  await rec.start('revision');
  await s.caption(VO.revision.open);
  await s.click('[data-testid="submission-revise-essay"]', { after: 0 });
  await page.waitForURL(/\/app\/revise\//);
  await page.waitForLoadState('networkidle');
  await sleep(1500);
  await s.caption(VO.revision.revise, { hold: false });

  // Select the sentence the feedback pointed to, then retype it.
  const draft = page.locator('[data-testid="revision-draft-pane"] .ProseMirror');
  await draft.waitFor();
  const target = draft.getByText(copy.WEAK_ANALYSIS, { exact: false });
  await s.moveTo(target);
  await draft.evaluate((root, sentence) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent.indexOf(sentence);
      if (at === -1) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + sentence.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    throw new Error('sentence not found');
  }, copy.WEAK_ANALYSIS);
  await sleep(1400);
  await page.keyboard.type(copy.REVISED_ANALYSIS, { delay: 16 });
  await sleep(600);
  await s.callout(draft.getByText('protection', { exact: false }), { ...VO.revision.reviseCallout, dim: false, holdMs: 5000 });
  await s.clearCallout();
  await s.click('[data-testid="revision-submit"]', { after: 900 });
  await s.click('[data-testid="revision-submit-confirm"]', { after: 1200 });
  await s.caption(VO.revision.submit);
  await rec.stop();
  await s.clearCaption();
};

segments.summary = async () => {
  const state = boothState();
  await titleCard(SECTIONS.summary);
  await as(copy.TEACHER.email);
  await go(page, `/app/my-classes/${state.classId}/assignments/${state.assignmentId}`);
  await s.dockCaption(null);
  await s.chapter(SECTIONS.summary, TOTAL_SECTIONS, SECTION_COLORS[SECTIONS.summary.n - 1].accent);
  await rec.start('summary');
  await s.caption(VO.summary.open, { hold: false });
  await sleep(1800);
  await s.caption(VO.summary.run, { hold: false });
  await s.click('[data-testid="class-insight-generate-button"]', { after: 0 });
  await page.getByText('How the class did').first().waitFor({ timeout: 45000 });
  await sleep(1200);
  await s.callout(null, { ...VO.summary.neverBefore, holdMs: 7000 });
  await s.clearCallout();

  await s.caption(VO.summary.patterns, { hold: false });
  await s.scrollTo(page.getByText('How the class did').first(), { block: 'start', ms: 1400 });
  const evidenceCard = page.locator('div', { has: page.getByText('Needs work', { exact: true }) }).filter({ hasText: 'Show student examples' }).last();
  await s.callout(evidenceCard, {
    title: 'The pattern behind the grades',
    body: 'Students quote the right moments, then stop explaining. Now you know what to teach.',
    side: 'top',
    holdMs: 6500,
  });
  await s.clearCallout();

  const groups = page.getByText('Differentiation starting points').first();
  if (await groups.count()) {
    await s.caption(VO.summary.groups, { hold: false });
    await s.scrollTo(groups, { block: 'start', ms: 1400 });
    await sleep(3500);
  }
  await s.clearCaption();
  const plan = page.getByRole('link', { name: 'Plan this lesson' }).first();
  await s.scrollTo(page.getByText('Suggested next steps').first(), { block: 'start', ms: 1400 });
  await s.callout(plan, { ...VO.summary.next, side: 'top', holdMs: 6500 });
  await s.clearCallout();
  await s.moveTo(plan);
  await sleep(600);
  await rec.stop();
};

segments.planner = async () => {
  const state = boothState();
  await titleCard(SECTIONS.planner);
  await as(copy.TEACHER.email);
  await go(page, `/app/lesson-planner?from=${state.classAssignmentId}&step=0`);
  await s.dockCaption(null);
  await s.chapter(SECTIONS.planner, TOTAL_SECTIONS, SECTION_COLORS[SECTIONS.planner.n - 1].accent);
  await rec.start('planner');
  await s.caption(VO.planner.open, { hold: false });
  const composer = page.getByLabel('Message the Lesson Planner');
  await s.callout('[data-testid="lesson-planner-seed"]', {
    title: 'From your class summary',
    body: 'The planner starts from what this class needs, not a blank page.',
    side: 'bottom',
    dim: false,
    holdMs: 5000,
  });
  await s.clearCallout();
  // Other ways in: the starter tiles under the composer.
  const tiles = page.getByText(/start from one of these/i).first();
  await s.scrollTo(tiles, { block: 'start', ms: 1300 });
  await s.callout(tiles.locator('xpath=..'), { ...VO.planner.otherStarts, side: 'top', dim: false, holdMs: 5000 });
  await s.clearCallout();
  await s.scrollTo(composer, { block: 'center', ms: 1100 });
  await s.click(composer, { after: 200 });
  await page.keyboard.press('Control+End');
  await page.keyboard.type(copy.PLANNER_ADDITION, { delay: 24 });
  await sleep(500);
  await s.caption(VO.planner.chat, { hold: false });
  await s.click(page.getByLabel('Send message'), { after: 0 });
  const stepsList = page.getByText('Steps in this plan').first();
  await stepsList.waitFor({ timeout: 90000 });
  await sleep(1500);
  await s.scrollTo(stepsList, { block: 'center', ms: 1400 });
  await s.callout(stepsList.locator('xpath=..'), { ...VO.planner.steps, side: 'right', dim: false, holdMs: 4500 });
  await s.clearCallout();

  await s.caption(VO.planner.stack, { hold: false });
  const addEverything = page.getByRole('button', { name: /Add everything to the stack/ }).first();
  await s.scrollTo(addEverything, { ms: 900 });
  await s.click(addEverything, { after: 1200 });
  await s.click(page.locator('[data-testid="lesson-packet-bar"]').getByRole('link', { name: /Open the stack/ }), { after: 0 });
  await page.waitForURL(/\/packet/);
  await page.locator('[data-testid="stack-v3"]').waitFor({ timeout: 30000 });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  const stackUrl = page.url();
  await sleep(1200);
  await rec.stop();

  // The stack: the run of show.
  await rec.start('stack');
  await s.clearCaption();
  await s.callout('[data-testid="time-bar-card"]', { ...VO.planner.runOfShow, side: 'bottom', holdMs: 5500 });
  await s.clearCallout();

  // The teacher stays in control: drag a step to a new place, cut one, undo.
  const cards = page.locator('[data-testid="run-card"]');
  await s.scrollTo(cards.nth(2), { ms: 900 });
  const from = await cards.nth(2).boundingBox();
  const to = await cards.nth(3).boundingBox();
  const start = { x: from.x + 70, y: from.y + from.height / 2 };
  const end = { x: to.x + 70, y: to.y + to.height * 0.8 };
  await booth('cursorTo', start.x, start.y, 600);
  await sleep(700);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 24; i += 1) {
    const x = start.x + ((end.x - start.x) * i) / 24;
    const y = start.y + ((end.y - start.y) * i) / 24;
    await page.mouse.move(x, y);
    await booth('cursorTo', x, y, 40);
    await sleep(45);
  }
  await page.mouse.up();
  await sleep(1300);
  await s.callout(cards.nth(3), { ...VO.planner.control, side: 'top', dim: false, holdMs: 4200 });
  await s.clearCallout();
  // A removal commits after six seconds unless it's undone, so undo promptly.
  await s.click(page.getByRole('button', { name: /^Remove / }).nth(3), { after: 1400 });
  await s.click(page.locator('[data-testid="remove-undo"]').getByRole('button', { name: 'Undo' }), { after: 1200 });

  // Writing steps become Yawp! assignments.
  const ticket = cards.filter({ hasText: 'how a quote proves a claim' }).first();
  await s.scrollTo(ticket, { ms: 900 });
  await s.click(ticket.locator('[data-testid="run-card-title"]'), { after: 900 });
  await s.click(ticket.locator('[data-testid="stack-create-assignment"]').first(), { after: 0 });
  await page.getByRole('button', { name: 'Create Assignment' }).waitFor({ timeout: 30000 });
  await sleep(900);
  await s.click(page.locator('label[for^="assignment-create-class-"]', { hasText: copy.CLASS.title }), { after: 600 });
  await s.click(page.getByRole('button', { name: 'Create Assignment' }), { after: 1500 });
  await s.click('[data-testid="back-to-lesson"]', { after: 0 });
  await page.locator('[data-testid="stack-v3"]').waitFor({ timeout: 30000 });
  await page.waitForLoadState('networkidle');
  const created = page.locator('[data-testid="in-yawp"]').first();
  await s.scrollTo(created, { ms: 900 });
  await s.callout(created.locator('xpath=ancestor::*[@data-testid="run-card"][1]'), { ...VO.planner.create, side: 'top', holdMs: 5000 });
  await s.clearCallout();
  await rec.stop();

  // The slide deck, built from the stack.
  await rec.start('deck');
  const buildDeck = page.locator('[data-testid="build-deck"]');
  await s.scrollTo(buildDeck, { ms: 800 });
  await s.click(buildDeck, { after: 0 });
  const deckCard = page.locator('[data-testid="slide-deck-card"]').last();
  await deckCard.waitFor({ timeout: 90000 });
  await sleep(1200);
  await s.scrollTo(deckCard, { ms: 900 });
  await s.callout(deckCard, { ...VO.planner.deck, side: 'right', dim: false, holdMs: 4500 });
  await s.clearCallout();
  await s.click(deckCard.getByRole('link', { name: /Present/ }).first(), { after: 0 });
  await page.waitForURL(/\/present\//);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await booth('hideCursor', true);
  await sleep(2200);
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('ArrowRight');
    await sleep(2000);
  }
  await rec.stop();

  // Send it: an administrator, a sub, a student who missed class.
  await go(page, stackUrl);
  const send = page.locator('[data-testid="send-lesson"]');
  await s.scrollTo(send, { block: 'start', ms: 900 });
  await rec.start('send');
  await s.click(send.getByRole('tab', { name: 'Student' }), { after: 900 });
  await s.click(send.getByRole('tab', { name: 'Admin' }), { after: 700 });
  await s.type(send.locator('[data-testid="send-recipient"]'), 'principal@northridge.example.org', { delay: 18 });
  await s.callout(send, { ...VO.planner.send, side: 'left', dim: false, holdMs: 5000 });
  await s.clearCallout();
  // End on "Writing it for them…": locally the email can only be previewed.
  await s.click(send.locator('[data-testid="send-button"]'), { after: 1500 });
  await rec.stop();
  await send.locator('[data-testid="send-done"]').waitFor({ timeout: 60000 });
  await s.clearCaption();
};

segments.practice = async () => {
  await titleCard(SECTIONS.practice);
  await as(copy.TEACHER.email);
  await go(page, '/app/writing-lessons');
  await s.dockCaption(null);
  await s.chapter(SECTIONS.practice, TOTAL_SECTIONS, SECTION_COLORS[SECTIONS.practice.n - 1].accent);
  await rec.start('practice');
  await s.caption(VO.practice.library, { hold: false });
  await sleep(1500);
  await s.click(page.getByRole('button', { name: /Grammar & Mechanics/ }).first(), { after: 1200 });
  await s.click('[data-testid="writing-lesson-card-fixing-comma-splices"]', { after: 0 });
  await page.waitForURL(/writing-lessons\/fixing-comma-splices/);
  await page.waitForLoadState('networkidle');
  await s.caption(VO.practice.lesson, { hold: false });
  await sleep(3500);
  await s.caption(VO.practice.exercise, { hold: false });
  await s.click(page.getByRole('button', { name: /Try the practice/ }).or(page.getByRole('link', { name: /Try the practice/ })).first(), { after: 0 });
  await page.waitForURL(/writing-lessons\/practice/);
  await page.waitForLoadState('networkidle');
  await sleep(1500);
  await s.click(page.locator('label, [role="radio"], button').filter({ hasText: copy.PRACTICE_QUESTIONS.questions[0].choices[1] }).first(), { after: 600 });
  await s.click(page.getByRole('button', { name: 'Check my answer' }), { after: 0 });
  const correct = page.getByText('Correct!').first();
  await correct.waitFor({ timeout: 15000 });
  await s.scrollTo(correct, { ms: 900 });
  await sleep(3000);
  await rec.stop();
  await s.clearCaption();
};

segments.close = async () => {
  await showCard(page, closingCard({ ...copy.CLOSING_CARD, disclosure: copy.DISCLOSURE }));
  await rec.start('closing');
  await sleep(8000);
  await rec.stop();
};

const order = ['open', 'assign', 'student', 'grading', 'revision', 'summary', 'planner', 'practice', 'close'];
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
