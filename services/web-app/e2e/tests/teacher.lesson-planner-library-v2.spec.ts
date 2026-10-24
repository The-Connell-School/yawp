/**
 * Brian's Oct 24 handoff, Part 2: the library redesign
 * (docs/plans/2026-10-24-stack-v2-and-library-redesign.md).
 *
 * Every lesson is seeded: the model is never called.
 */
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setLessonPlannerReviewFlag, type LessonPlannerReviewFlag } from '../feature-flags';
import { DAY_ONE_REPLY } from '../fixtures/lesson-planner/day-one-reply';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const FLAGS: LessonPlannerReviewFlag[] = [
  'lesson_planner_stack_v2',
  'lesson_planner_stack_v3',
  'lesson_planner_teach_notes',
  'lesson_planner_library_v2',
];

type Ctx = { teacherMembershipId: string; organizationId: string };

/** A lesson whose stack is a 40-minute step and a 10-minute exit ticket: 20% writing. */
async function seedLesson(
  prisma: ReturnType<typeof createE2EPrismaClient>,
  ctx: Ctx,
  { title, unitId = null, unitDay = null, set = true }: { title: string; unitId?: string | null; unitDay?: number | null; set?: boolean }
) {
  const at = new Date(Date.UTC(2026, 9, 24, 9));
  return prisma.lessonPlanConversation.create({
    data: {
      membershipId: ctx.teacherMembershipId,
      organizationId: ctx.organizationId,
      title,
      periodMinutes: 50,
      unitId,
      unitDay,
      setAt: set ? at : null,
      materials: {
        create: [
          { sourceMessageId: 'seed', sourceCreatedAt: at, blockKey: 'a', slot: 'a', kind: 'step', title: 'Read the chapter', audience: 'teacher', content: 'Read it together.', minutes: 40 },
          { sourceMessageId: 'seed', sourceCreatedAt: new Date(at.getTime() + 1), blockKey: 'b', slot: 'b', kind: 'exit-ticket', title: 'Exit ticket', audience: 'student', content: 'One line on Holden.', minutes: 10 },
        ],
      },
    },
    select: { id: true },
  });
}

async function seedLibrary(ctx: Ctx) {
  const prisma = createE2EPrismaClient();
  try {
    const course = await prisma.lessonPlanCourse.create({ data: { membershipId: ctx.teacherMembershipId, name: 'American Literature', position: 0 } });
    const group = await prisma.lessonPlanUnitGroup.create({
      data: { courseId: course.id, title: 'Romanticism', subtitle: '1830–1865', position: 1 },
    });
    const unit = (title: string, kind: string, position: number, groupId: string | null = null) =>
      prisma.lessonPlanUnit.create({
        data: { membershipId: ctx.teacherMembershipId, organizationId: ctx.organizationId, title, kind, courseId: course.id, groupId, position },
        select: { id: true },
      });
    const catcher = await unit('The Catcher in the Rye', 'book', 0);
    const poems = await unit('Dickinson and Whitman', 'poetry', 0, group.id);
    const essays = await unit('Transcendentalist essays', 'texts', 1, group.id);
    await seedLesson(prisma, ctx, { title: 'Meet Holden', unitId: catcher.id, unitDay: 1 });
    await seedLesson(prisma, ctx, { title: 'The red hunting hat', unitId: catcher.id, unitDay: 2, set: false });
    await seedLesson(prisma, ctx, { title: 'A narrow fellow', unitId: poems.id, unitDay: 1 });
    const loose = await seedLesson(prisma, ctx, { title: 'Phony words', set: false });
    return { courseId: course.id, groupId: group.id, catcher: catcher.id, poems: poems.id, essays: essays.id, loose: loose.id };
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("Library redesign (Brian's Oct 24 handoff, Part 2)", () => {
  async function clearLibrary(ctx: Ctx) {
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
    await clearLibrary(e2eContext);
  });
  // Leave nothing behind for the specs that run after this one.
  test.afterEach(async ({ e2eContext }) => {
    await clearLibrary(e2eContext);
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, false);
  });

  test('L1: course tabs, kinds, units as tiles in groups, and lessons on their own', async ({ page, signIn, e2eContext }) => {
    await seedLibrary(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner/library');
    const library = page.getByTestId('library-v2');
    await expect(library.getByRole('heading', { name: 'Your library' })).toBeVisible();
    await expect(page.getByTestId('new-unit')).toBeVisible();
    await expect(page.getByTestId('plan-a-lesson')).toBeVisible();
    await expect(page.getByTestId('course-tab').first()).toHaveText('American Literature');

    // Only the kinds in this course.
    await expect(page.getByTestId('kind-filter').getByRole('button')).toHaveText(['All kinds', 'Book', 'Short texts', 'Poetry', 'Select units']);

    const catcher = page.locator('[data-testid="unit-tile"][data-unit="The Catcher in the Rye"]');
    await expect(catcher.getByTestId('unit-lessons')).toHaveText('2 lessons · 1 draft');
    await expect(catcher).toContainText('Book');
    await expect(catcher).toContainText('20% writing');
    const group = page.locator('[data-testid="unit-group"][data-group="Romanticism"]');
    await expect(group).toContainText('1830–1865');
    await expect(group).toContainText('2 units');
    await expect(group.getByTestId('unit-tile')).toHaveCount(2);
    await expect(page.locator('[data-unit="Transcendentalist essays"]').getByTestId('unit-lessons')).toHaveText('No lessons yet');

    // Filtering hides other kinds, and a group with none.
    await page.getByTestId('kind-book').click();
    await expect(page.getByTestId('unit-tile')).toHaveCount(1);
    await expect(group).toHaveCount(0);
    await page.getByTestId('kind-all').click();

    const loose = page.locator('[data-testid="loose-lesson"][data-lesson="Phony words"]');
    await expect(loose).toContainText('Draft');
    await expect(loose.getByRole('link', { name: 'Keep planning' })).toBeVisible();

    // The whole tile opens the unit.
    await catcher.getByTestId('unit-open').click();
    await expect(page).toHaveURL(/\/app\/lesson-planner\/library\/unit\//);
    await expect(page.getByTestId('unit-title')).toHaveText('The Catcher in the Rye');
  });

  test('moves show Undo: a lesson into a unit, units into a group, ungroup', async ({ page, signIn, e2eContext }) => {
    await seedLibrary(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner/library');
    const catcher = page.locator('[data-testid="unit-tile"][data-unit="The Catcher in the Rye"]');

    // Move to a unit… then Undo.
    await page.locator('[data-lesson="Phony words"]').getByTestId('move-to-unit').selectOption({ label: 'The Catcher in the Rye' });
    await expect(page.getByTestId('library-status-message')).toHaveText("Moved to The Catcher in the Rye. It's the last lesson in the unit.");
    await expect(catcher.getByTestId('unit-lessons')).toHaveText('3 lessons · 2 drafts');
    await expect(page.getByTestId('loose-lesson')).toHaveCount(0);
    await page.getByTestId('library-undo').click();
    await expect(page.getByTestId('library-status-message')).toHaveText('Undone.');
    await expect(catcher.getByTestId('unit-lessons')).toHaveText('2 lessons · 1 draft');
    await expect(page.getByTestId('loose-lesson')).toHaveCount(1);

    // Drag a lesson card onto a unit tile.
    await page.locator('[data-lesson="Phony words"]').dragTo(page.locator('[data-unit="Transcendentalist essays"]'));
    await expect(page.locator('[data-unit="Transcendentalist essays"]').getByTestId('unit-lessons')).toHaveText('1 lesson · 1 draft');

    // Select units › Group these.
    await page.getByTestId('select-units').click();
    await catcher.getByTestId('unit-select').click();
    await expect(page.getByTestId('select-count')).toHaveText('1 unit selected');
    await page.getByTestId('group-these').click();
    await page.getByTestId('group-name').fill('Modern novels');
    await page.getByTestId('group-create').click();
    const modern = page.locator('[data-testid="unit-group"][data-group="Modern novels"]');
    await expect(modern.getByTestId('unit-tile')).toHaveCount(1);
    await expect(page.getByTestId('library-status-message')).toContainText('Grouped 1 unit as Modern novels.');

    // ⋯ › Move to group.
    const poems = page.locator('[data-unit="Dickinson and Whitman"]');
    await poems.getByTestId('unit-menu').click();
    await page.getByTestId('unit-move-to-group').click();
    await page.getByTestId('unit-move-group-option').filter({ hasText: 'Modern novels' }).click();
    await expect(modern.getByTestId('unit-tile')).toHaveCount(2);

    // Edit group › Ungroup: the units stay, on their own; then Undo.
    await modern.getByTestId('edit-group').click();
    await page.getByTestId('ungroup').click();
    await expect(modern).toHaveCount(0);
    await expect(page.getByTestId('unit-tile')).toHaveCount(3);
    await page.getByTestId('library-undo').click();
    await expect(page.locator('[data-testid="unit-group"][data-group="Modern novels"]').getByTestId('unit-tile')).toHaveCount(2);
  });

  test('new unit, add a group, rename, duplicate and delete with Undo', async ({ page, signIn, e2eContext }) => {
    await seedLibrary(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner/library');

    await page.getByTestId('new-unit').click();
    await page.getByTestId('new-unit-name').fill('The Great Gatsby');
    await page.getByTestId('new-unit-kind').selectOption('book');
    await page.getByTestId('new-unit-group').selectOption({ label: 'Romanticism' });
    await page.getByTestId('new-unit-create').click();
    const group = page.locator('[data-testid="unit-group"][data-group="Romanticism"]');
    await expect(group.locator('[data-unit="The Great Gatsby"]')).toBeVisible();

    await page.getByTestId('add-group').click();
    await expect(page.locator('[data-testid="unit-group"][data-group="New group"]').getByTestId('group-empty')).toHaveText(
      'Drag units here, or use a unit’s ⋯ menu › Move to group'
    );

    const catcher = page.locator('[data-unit="The Catcher in the Rye"]');
    await catcher.getByTestId('unit-menu').click();
    await page.getByTestId('unit-rename').click();
    await page.getByTestId('unit-rename-input').fill('Catcher');
    await page.getByTestId('unit-rename-save').click();
    const renamed = page.locator('[data-unit="Catcher"]');
    await expect(renamed).toBeVisible();

    await renamed.getByTestId('unit-menu').click();
    await page.getByTestId('unit-duplicate').click();
    await expect(page.locator('[data-unit="Catcher (copy)"]').getByTestId('unit-lessons')).toHaveText('2 lessons · 2 drafts');

    await renamed.getByTestId('unit-menu').click();
    await page.getByTestId('unit-delete').click();
    await expect(page.getByTestId('library-status-message')).toHaveText('Deleted Catcher. Its lessons are under Lessons on their own.');
    await expect(page.locator('[data-lesson="Meet Holden"]')).toBeVisible();
    await page.getByTestId('library-undo').click();
    await expect(page.locator('[data-unit="Catcher"]').getByTestId('unit-lessons')).toHaveText('2 lessons · 1 draft');
    await expect(page.locator('[data-lesson="Meet Holden"]')).toHaveCount(0);
  });

  test('L2: a unit, opened: contents, day tabs, preview, insert anywhere', async ({ page, signIn, e2eContext }) => {
    const seeded = await seedLibrary(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/library/unit/${seeded.catcher}`);
    await expect(page.getByTestId('unit-glance-lessons')).toHaveText('2 lessons · 1 draft');
    await expect(page.getByTestId('unit-glance-writing')).toHaveText('Writing: 20 min · 20%');
    await expect(page.getByTestId('contents-row')).toHaveCount(2);
    await expect(page.getByTestId('day-tab')).toHaveCount(2);

    const preview = page.getByTestId('lesson-preview');
    await expect(page.getByTestId('preview-day')).toHaveText('Day 1 of 2 · No date yet');
    await expect(page.getByTestId('preview-title')).toHaveText('Meet Holden');
    await expect(page.getByTestId('preview-open')).toHaveText('Open the run of show');
    await expect(preview).toContainText('50 of 50 min · right on time');
    await expect(preview).toContainText('20% writing · 10 min');
    await expect(page.getByTestId('preview-run')).toContainText('Exit ticket');
    await page.getByTestId('day-tab').nth(1).click();
    await expect(page.getByTestId('preview-open')).toHaveText('Keep planning');

    // Add an existing lesson between Day 1 and Day 2.
    await page.getByTestId('add-existing').click();
    await page.getByTestId('add-where').selectOption({ label: 'After Day 1 · Meet Holden' });
    await expect(page.getByTestId('add-result')).toHaveText('It becomes Day 2. Day 2 and the days after it move down one.');
    await page.getByTestId('add-lesson').selectOption({ label: 'Phony words' });
    await page.getByTestId('add-to-unit').click();
    await expect(page.getByTestId('contents-row')).toHaveCount(3);
    await expect(page.getByTestId('contents-row').nth(1)).toContainText('Day 2');
    await expect(page.getByTestId('contents-row').nth(1)).toContainText('Phony words');
    await expect(page.getByTestId('preview-title')).toHaveText('Phony words');
    await expect(page.getByTestId('contents-row').nth(2)).toContainText('The red hunting hat');
    await page.getByTestId('library-undo').click();
    await expect(page.getByTestId('contents-row')).toHaveCount(2);

    // Insert anywhere: the "+" above Day 1 plans a new Day 1, in the planner.
    await page.getByTestId('contents-row').first().hover();
    await page.getByTestId('insert-here').first().click({ force: true });
    await expect(page.getByTestId('add-result')).toHaveText('It becomes Day 1. Day 1 and the days after it move down one.');
    await page.getByTestId('add-start').click();
    await expect(page).toHaveURL(/\/app\/lesson-planner\?c=/);
    await page.goto(`/app/lesson-planner/library/unit/${seeded.catcher}`);
    await expect(page.getByTestId('contents-row').first()).toContainText('New lesson');
    await expect(page.getByTestId('preview-open')).toHaveText('Start planning');
    await expect(page.getByTestId('preview-empty')).toBeVisible();

    // Move to another unit… from the preview footer.
    await page.getByTestId('day-tab').nth(1).click();
    await page.getByTestId('preview-move').selectOption({ label: 'American Literature · Transcendentalist essays' });
    await expect(page.getByTestId('contents-row')).toHaveCount(2);
  });

  test('L3: Plan a lesson asks where it lives; a set lesson can be saved to a unit', async ({ page, signIn, e2eContext }) => {
    const seeded = await seedLibrary(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner/library');
    await page.getByTestId('plan-a-lesson').click();
    const dialog = page.getByTestId('plan-lesson-dialog');
    await expect(dialog).toContainText('Plan a new lesson');
    await expect(dialog).toContainText('Pick where it lives now, or decide later. You can move it any time.');
    await page.getByTestId('plan-unit').selectOption({ label: 'The Catcher in the Rye' });
    await expect(page.getByTestId('plan-place')).toHaveText('It becomes Day 3, after “The red hunting hat.”');
    await page.getByTestId('plan-start').click();
    await expect(page).toHaveURL(/\/app\/lesson-planner\?c=/);
    await page.goto(`/app/lesson-planner/library/unit/${seeded.catcher}`);
    await expect(page.getByTestId('contents-row')).toHaveCount(3);

    // A lesson planned first, then set, is saved to a unit from the stack.
    const prisma = createE2EPrismaClient();
    let conversationId = '';
    try {
      const lesson = await prisma.lessonPlanConversation.create({
        data: {
          membershipId: e2eContext.teacherMembershipId,
          organizationId: e2eContext.organizationId,
          title: 'Day one',
          periodMinutes: 50,
          messages: {
            create: [
              { role: 'user', content: 'Day one of The Things They Carried, 50 minutes.' },
              { role: 'assistant', content: DAY_ONE_REPLY, keptAt: new Date(), keptAudience: 'teacher' },
            ],
          },
        },
        select: { id: true },
      });
      conversationId = lesson.id;
    } finally {
      await prisma.$disconnect();
    }
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.getByTestId('set-lesson').click();
    await page.getByTestId('save-to-unit-select').selectOption({ label: 'American Literature · Transcendentalist essays' });
    await page.getByTestId('save-to-unit-save').click();
    await expect(page.getByTestId('saved-to-unit')).toHaveText("Moved to Transcendentalist essays. It's the last lesson in the unit.");
  });
  test('drag a unit onto a group, out of it, and Shift-click to select', async ({ page, signIn, e2eContext }) => {
    await seedLibrary(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner/library');
    const group = page.locator('[data-testid="unit-group"][data-group="Romanticism"]');
    await page.locator('[data-unit="The Catcher in the Rye"]').dragTo(group);
    await expect(page.getByTestId('library-status-message')).toHaveText('Moved The Catcher in the Rye to Romanticism.');
    await expect(group.getByTestId('unit-tile')).toHaveCount(3);

    // Dragging a unit in a group offers a way out.
    const poems = page.locator('[data-unit="Dickinson and Whitman"]');
    await poems.hover();
    await page.mouse.down();
    await page.mouse.move(400, 600, { steps: 5 });
    const zone = page.getByTestId('drop-out-of-group');
    await expect(zone).toBeVisible();
    const box = (await zone.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('library-status-message')).toHaveText('Took Dickinson and Whitman out of the group.');
    await expect(group.getByTestId('unit-tile')).toHaveCount(2);

    // Shift-click selects, without opening the unit.
    await page.locator('[data-unit="Dickinson and Whitman"]').getByTestId('unit-open').click({ modifiers: ['Shift'] });
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.getByTestId('select-count')).toHaveText('1 unit selected');
    await page.getByTestId('select-done').click();
    await expect(page.getByTestId('select-bar')).toHaveCount(0);
  });
});
