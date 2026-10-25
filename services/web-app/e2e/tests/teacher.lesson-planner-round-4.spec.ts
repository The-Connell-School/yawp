/**
 * Brian's round 4 notes, Oct 25 (docs/plans/2026-10-25-brian-round-4.md), on
 * "Sinners in the Hands of an Angry God", Day 2 of the English 10 unit "Age
 * of Reason/Enlightenment".
 *
 * Every lesson is seeded: the model is never called. With no model key, a
 * share page's text is the timed steps, which is what the admin test reads.
 */
import { extractText, getDocumentProxy } from 'unpdf';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setLessonPlannerReviewFlag, type LessonPlannerReviewFlag } from '../feature-flags';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const FLAGS: LessonPlannerReviewFlag[] = [
  'lesson_planner_stack_v2',
  'lesson_planner_stack_v3',
  'lesson_planner_teach_notes',
  'lesson_planner_library_v2',
  'lesson_planner_share',
];

type Ctx = { teacherMembershipId: string; organizationId: string };

const AT = new Date(Date.UTC(2026, 9, 25, 9));
const CLASS = 'English 10 · Period 3';

const DECK = {
  title: 'Sinners in the Hands of an Angry God',
  slides: [
    { layout: 'title', title: 'Sinners in the Hands of an Angry God', speakerNotes: 'Let the room settle.' },
    { layout: 'statement', title: 'The spider', body: 'Much as one holds a spider over the fire.', speakerNotes: 'Read it twice.' },
  ],
};
const DECK_BLOCK = '```yawp-slides\n' + JSON.stringify(DECK) + '\n```';

/**
 * Day 2 of a unit planned for English 10 · Period 3. The day has its period
 * but no class of its own, as Brian's did. The class starter and the exit
 * ticket were made in Yawp!.
 */
async function seedSinners(ctx: Ctx, { inUnit = true }: { inUnit?: boolean } = {}) {
  const prisma = createE2EPrismaClient();
  try {
    const course = await prisma.lessonPlanCourse.create({ data: { membershipId: ctx.teacherMembershipId, name: 'English 10' } });
    const unit = inUnit
      ? await prisma.lessonPlanUnit.create({
          data: {
            membershipId: ctx.teacherMembershipId,
            organizationId: ctx.organizationId,
            title: 'Age of Reason/Enlightenment',
            courseId: course.id,
          },
        })
      : null;
    if (unit) {
      await prisma.lessonPlanConversation.create({
        data: {
          membershipId: ctx.teacherMembershipId,
          organizationId: ctx.organizationId,
          title: 'Plan the Age of Reason unit',
          unitId: unit.id,
          periodMinutes: 50,
          lessonClassLabel: CLASS,
        },
      });
    }
    const pieces = [
      { kind: 'class-starter', title: 'What actually moves people', minutes: 5, audience: 'student', content: 'Think of a time words moved you.', made: true },
      { kind: 'step', title: 'Read Aloud', minutes: 20, stepType: 'read_aloud', content: 'Read the sermon aloud.' },
      { kind: 'step', title: 'Discussion', minutes: 17, stepType: 'activity', hasHandout: true, content: 'Pairs, then the whole class.' },
      { kind: 'exit-ticket', title: 'Reason and emotion', minutes: 5, audience: 'student', content: 'In your own words, explain how Edwards persuades.', made: true },
    ];
    const day = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: ctx.teacherMembershipId,
        organizationId: ctx.organizationId,
        title: 'Day 2: Sinners in the Hands of an Angry God',
        unitId: unit?.id ?? null,
        unitDay: unit ? 2 : null,
        periodMinutes: 50,
        messages: { create: [{ role: 'user', content: 'Day 2 of the unit.' }] },
        materials: {
          create: [
            ...pieces.map((piece, index) => ({
              sourceMessageId: 'seed',
              sourceCreatedAt: new Date(AT.getTime() + index),
              blockKey: `b${index}`,
              slot: `s${index}`,
              kind: piece.kind,
              title: piece.title,
              audience: piece.audience ?? 'teacher',
              content: piece.content,
              minutes: piece.minutes,
              stepType: piece.stepType ?? null,
              hasHandout: piece.hasHandout ?? null,
              ...(piece.made ? { yawpHref: '/app/assignment-types/x', yawpCreatedAt: AT } : {}),
            })),
            {
              sourceMessageId: 'seed-deck',
              sourceCreatedAt: new Date(AT.getTime() + 100),
              blockKey: 'deck',
              slot: 'deck',
              kind: 'slides',
              title: DECK.title,
              audience: 'teacher',
              content: DECK_BLOCK,
            },
          ],
        },
      },
      select: { id: true },
    });
    return { unitId: unit?.id ?? null, conversationId: day.id };
  } finally {
    await prisma.$disconnect();
  }
}

async function pdfText(page: import('@playwright/test').Page, url: string) {
  const response = await page.request.get(url);
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toBe('application/pdf');
  const doc = await getDocumentProxy(new Uint8Array(await response.body()));
  return (await extractText(doc, { mergePages: true })).text.replace(/\s+/g, ' ');
}

test.describe("Brian's round 4 (Oct 25)", () => {
  async function clear(ctx: Ctx) {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanConversation.deleteMany({ where: { membershipId: ctx.teacherMembershipId } });
      await prisma.lessonPlanUnit.deleteMany({ where: { membershipId: ctx.teacherMembershipId } });
      await prisma.lessonPlanCourse.deleteMany({ where: { membershipId: ctx.teacherMembershipId } });
    } finally {
      await prisma.$disconnect();
    }
  }
  test.beforeEach(async ({ e2eContext }) => {
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await clear(e2eContext);
  });
  test.afterEach(async ({ e2eContext }) => {
    await clear(e2eContext);
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, false);
  });

  test('share pages: the student box lists types; the admin page has the class and steps by type (3, 4)', async ({
    page,
    signIn,
    e2eContext,
    browser,
  }) => {
    const { conversationId } = await seedSinners(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    // The class comes from the unit (4).
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await expect(page.getByTestId('stack-chip-class')).toHaveText(CLASS);

    const share = await page.request.post('/api/domain/lesson-planner/stack', {
      form: { intent: 'create-share', conversationId, includes: 'daily-pages' },
    });
    const admin = await page.request.post('/api/domain/lesson-planner/stack', {
      form: { intent: 'send-lesson', conversationId, audience: 'admin', recipient: 'principal@school.org', includes: 'summary,observe' },
    });
    expect(admin.ok()).toBe(true);

    const stranger = await browser.newContext();
    const visitor = await stranger.newPage();
    await visitor.goto(((await share.json()) as { url: string }).url);
    await expect(visitor.getByTestId('shared-in-yawp-lead')).toHaveText(
      'These writing assignments from class are available to complete in Yawp!'
    );
    await expect(visitor.getByTestId('shared-in-yawp').locator('li')).toHaveText(['Class Starter', 'Exit Ticket']);

    await visitor.goto(((await admin.json()) as { url: string }).url);
    const body = visitor.getByTestId('shared-body');
    await expect(body).toContainText('Class Starter: What actually moves people');
    await expect(body).toContainText(`with ${CLASS}`);
    await expect(body).not.toContainText('Not specified');
    await stranger.close();
  });

  test('the stack: print a packet for class, with or without slides (5)', async ({ page, signIn, e2eContext }) => {
    const { conversationId } = await seedSinners(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    const box = page.getByTestId('print-for-class');

    // The individual downloads stay.
    for (const id of ['plan-word', 'plan-pdf-v3', 'deck-pdf', 'handouts-word', 'handouts-pdf']) {
      await expect(box.getByTestId(id)).toBeVisible();
    }
    await expect(box.getByTestId('deck-pdf')).toHaveAttribute('href', /slides\.pdf\?perPage=4$/);

    await box.getByTestId('one-packet').click();
    const list = box.getByTestId('packet-checklist');
    await expect(list.getByTestId('packet-part-plan')).toBeChecked();
    await expect(list.getByTestId('packet-part-slides')).not.toBeChecked();
    await expect(list.getByTestId('packet-part-handouts')).toBeChecked();
    await expect(list.getByTestId('packet-per-page')).toHaveCount(0);
    const print = list.getByTestId('packet-print');
    await expect(print).toHaveText('Print the packet (PDF)');
    const withoutSlides = await print.getAttribute('href');
    expect(withoutSlides).toContain('parts=plan%2Chandouts');
    const text = await pdfText(page, withoutSlides!);
    expect(text).toContain('Discussion');
    expect(text).not.toContain('Slide 1 of 2');

    // Slides in, four to a page by default; two on request.
    await list.getByTestId('packet-part-slides').check();
    await expect(list.getByTestId('packet-per-page').getByRole('button', { name: '4' })).toHaveAttribute('aria-pressed', 'true');
    await expect(print).toHaveAttribute('href', /parts=plan%2Cslides%2Chandouts&perPage=4/);
    expect(await pdfText(page, (await print.getAttribute('href'))!)).toContain('Slide 1 of 2');
    await list.getByTestId('packet-per-page').getByRole('button', { name: '2' }).click();
    await expect(print).toHaveAttribute('href', /perPage=2/);
    await expect(box.getByTestId('deck-pdf')).toHaveAttribute('href', /perPage=2$/);
  });

  test('the stack: a rebuilt deck says it is ready, with no word of the Lounge (6)', async ({ page, signIn, e2eContext }) => {
    const { conversationId } = await seedSinners(e2eContext);
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanMessage.createMany({
        data: [
          { conversationId, role: 'user', content: 'Rebuild the slide deck from my stack', surface: 'stack', createdAt: new Date(AT.getTime() + 200) },
          {
            conversationId,
            role: 'assistant',
            surface: 'stack',
            createdAt: new Date(AT.getTime() + 201),
            content: `The deck lives in your lesson stack rather than the Lounge, so here it is.\n\n${DECK_BLOCK}`,
          },
        ],
      });
    } finally {
      await prisma.$disconnect();
    }
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.getByTestId('open-ask').click();
    const reply = page.getByTestId('add-panel').getByTestId('ask-reply').last();
    await expect(reply).toHaveText("Here you go: new slides based on your revised stack. Everything's updated and ready to go!");
    await expect(page.getByTestId('add-panel')).not.toContainText('Lounge');
  });

  test('saving: where it is saved, one library control, a warning before leaving, and Keep planning (7)', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const { unitId, conversationId } = await seedSinners(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const where = page.getByTestId('stack-save-where');
    await expect(where).toHaveText(/^Saved to English 10 › Age of Reason\/Enlightenment · /);
    await expect(where).toHaveAttribute('href', `/app/lesson-planner/library/unit/${unitId}`);
    const control = page.getByTestId('library-control');
    await expect(control).toHaveText('In your library ✓');
    await expect(control).toHaveAttribute('href', `/app/lesson-planner/library/unit/${unitId}`);
    await expect(page.getByTestId('open-library')).toHaveCount(0);

    // A change still on its way: leaving asks first, and staying stays.
    // Held for a few seconds, so the change is still on its way.
    const stackApi = (url: URL) => url.pathname.startsWith('/api/domain/lesson-planner/stack');
    await page.route(stackApi, async (route) => {
      if (route.request().postData()?.includes('set-minutes')) await new Promise((resolve) => setTimeout(resolve, 4000));
      await route.continue();
    });
    const minutes = page.getByTestId('run-card').nth(1).getByTestId('step-minutes');
    await expect(minutes).toHaveText('20 min');
    await minutes.click();
    await page.getByTestId('step-minutes-input').fill('18');
    await page.getByTestId('step-minutes-input').press('Enter');
    await expect(minutes).toHaveText('18 min');
    await expect(page.getByTestId('stack-save-state')).toHaveText('Saving…', { timeout: 3000 });
    let asked = '';
    page.once('dialog', async (dialog) => {
      asked = dialog.message();
      await dialog.dismiss();
    });
    await page.getByRole('link', { name: 'Back to planning' }).click();
    await expect.poll(() => asked).toBe('A change is still saving. Leave anyway?');
    await expect(page).toHaveURL(new RegExp(`/app/lesson-planner/${conversationId}/packet`));
    await expect(where).toHaveText(/ · just now$/);
    await page.unroute(stackApi);

    // The way back: Keep planning on the library and the planner home.
    await page.goto('/app/lesson-planner/library');
    const recent = page.getByTestId('keep-planning-lesson').first();
    await expect(recent).toContainText('Day 2: Sinners in the Hands of an Angry God');
    await expect(recent).toContainText('Saved to English 10 › Age of Reason/Enlightenment');
    await expect(recent).toHaveAttribute('href', `/app/lesson-planner/${conversationId}/packet`);
    await page.goto('/app/lesson-planner');
    await expect(page.getByTestId('keep-planning-lesson').first()).toContainText('Day 2: Sinners in the Hands of an Angry God');
  });

  test('saving: a lesson on its own is saved to the library in one click (7)', async ({ page, signIn, e2eContext }) => {
    const { conversationId } = await seedSinners(e2eContext, { inUnit: false });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await expect(page.getByTestId('stack-save-where')).toHaveText(/^Saved to Your library › Lessons on their own · /);
    const control = page.getByTestId('library-control');
    await expect(control).toHaveText('Save to library');
    await control.click();
    await page.getByTestId('library-choice-own').click();
    await expect(page.getByTestId('library-control')).toHaveText('In your library ✓');
    await page.reload();
    await expect(page.getByTestId('library-control')).toHaveText('In your library ✓');
  });

  test('the library: near-white tiles and rows that lift on hover (8)', async ({ page, signIn, e2eContext }) => {
    await seedSinners(e2eContext);
    await seedLoose(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner/library');
    const tile = page.getByTestId('unit-tile').first();
    await expect(tile).toBeVisible();
    const page_ = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const look = await tile.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, radius: style.borderTopLeftRadius };
    });
    expect(look).toEqual({ background: 'rgb(255, 254, 250)', radius: '10px' });
    expect(page_).not.toBe(look.background);
    const row = page.getByTestId('loose-lesson').first();
    expect(await row.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 254, 250)');
  });
});

async function seedLoose(ctx: Ctx) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.lessonPlanConversation.create({
      data: {
        membershipId: ctx.teacherMembershipId,
        organizationId: ctx.organizationId,
        title: 'Poetry Friday: Wild Geese',
        messages: { create: [{ role: 'user', content: 'A poem lesson.' }] },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
