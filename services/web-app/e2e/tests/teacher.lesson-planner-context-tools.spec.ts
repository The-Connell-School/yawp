/**
 * Timelines and maps for introducing a text (Nov 19): two slide layouts,
 * stepped through in Present and typed on in the deck studio. The deck is
 * seeded as the planner would store it (its places found by Yawp!'s own
 * place list); the model is never called, and no map service exists to call.
 */
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setLessonPlannerReviewFlag, type LessonPlannerReviewFlag } from '../feature-flags';
import { fenceSlideDeck, parseSlideDeck, type Slide, type SlideDeck } from '../../app/domain/lesson-planner/slide-deck';
import { resolveDeckPlaces } from '../../app/domain/geo/places.server';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const KIT_FLAGS: LessonPlannerReviewFlag[] = ['lesson_planner_deck_v2', 'lesson_planner_deck_gallery', 'lesson_planner_deck_kit_v4', 'lesson_planner_deck_kit_v41'];
const STUDIO_FLAGS: LessonPlannerReviewFlag[] = [...KIT_FLAGS, 'lesson_planner_deck_studio', 'lesson_planner_context_tools'];

const DECK: SlideDeck = resolveDeckPlaces({
  title: 'Sudan before the novel',
  unit: 'Season of Migration to the North',
  slides: [
    { layout: 'title', title: 'Sudan before the novel', speakerNotes: 'Open.' },
    {
      layout: 'timeline',
      title: 'Sixty years, two flags',
      body: 'What happened before the novel begins.',
      events: [
        { date: '1899', title: 'Britain and Egypt rule together', detail: 'The Condominium begins: two flags, one ruler in practice.' },
        { date: '1924', title: 'Egyptian troops sent home', detail: 'After a governor is killed in Cairo, Britain rules alone in all but name.' },
        { date: '1956', title: 'Independence', detail: 'Sudan becomes independent on January 1.' },
        { date: '1966', title: 'The novel is published', detail: 'Tayeb Salih publishes the novel in Arabic, ten years after independence.' },
      ],
      speakerNotes: 'Step through the four.',
    },
    {
      layout: 'map',
      title: 'The narrator’s journey',
      route: true,
      shade: ['Sudan', 'South Sudan'],
      shadeLabel: 'Sudan in 1956',
      places: [
        { name: 'Khartoum', where: 'Sudan', note: 'Where the two Niles meet, and the capital.' },
        { name: 'Cairo', where: 'Egypt', note: 'The first stop on the way north.' },
        { name: 'London', where: 'United Kingdom', note: 'Seven years of study, far from the river.' },
      ],
      speakerNotes: 'Follow the route north.',
    },
    { layout: 'exit', title: 'Before you go', body: 'What changed at independence?', speakerNotes: 'Close.' },
  ] as Slide[],
});
const REPLY = `Here is the deck.\n\n${fenceSlideDeck(DECK)}`;

type Ctx = { teacherMembershipId: string; organizationId: string };

async function seedConversation(e2eContext: Ctx) {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Sudan before the novel',
        periodMinutes: 55,
        messages: {
          create: [
            { role: 'user', content: 'Build the slide deck for this lesson', createdAt: new Date(Date.UTC(2026, 10, 19, 10, 0, 0)) },
            { role: 'assistant', content: REPLY, createdAt: new Date(Date.UTC(2026, 10, 19, 10, 0, 1)) },
          ],
        },
      },
      select: { id: true, messages: { where: { role: 'assistant' }, select: { id: true } } },
    });
    return { conversationId: conversation.id, assistantId: conversation.messages[0]!.id };
  } finally {
    await prisma.$disconnect();
  }
}

async function savedDeck(conversationId: string): Promise<SlideDeck | null> {
  const prisma = createE2EPrismaClient();
  try {
    const material = await prisma.lessonPlanMaterial.findFirst({ where: { conversationId, slot: 'deck' }, select: { content: true } });
    return material ? (parseSlideDeck(material.content)?.deck ?? null) : null;
  } finally {
    await prisma.$disconnect();
  }
}

async function clearLessonPlans(membershipId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.lessonPlanConversation.deleteMany({ where: { membershipId } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Timelines and maps', () => {
  test.afterEach(async ({ e2eContext }) => {
    for (const flag of STUDIO_FLAGS) await setLessonPlannerReviewFlag(flag, false);
    await clearLessonPlans(e2eContext.teacherMembershipId);
  });

  test('Present steps through a timeline’s events with the arrows, then moves on', async ({ page, signIn, e2eContext }) => {
    for (const flag of KIT_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/present/${conversationId}/${assistantId}`);
    await page.waitForLoadState('networkidle');
    const stage = page.getByTestId('slide-stage').first();
    const counter = page.getByTestId('slide-counter').last();

    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('2 / 4');
    await expect(stage.locator('[data-template="timeline"]')).toBeVisible();
    // The overview: every event, and the slide's own line.
    await expect(page.getByTestId('slide-step')).toHaveText('4 to step through');
    await expect(stage).toContainText('1899');
    await expect(stage).toContainText('The novel is published');
    await expect(stage).toContainText('What happened before the novel begins.');

    // Each arrow puts the next event in focus, with its sentence.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('slide-step')).toHaveText('1 of 4');
    await expect(counter).toHaveText('2 / 4');
    await expect(stage).toContainText('The Condominium begins: two flags, one ruler in practice.');
    await expect(stage).not.toContainText('What happened before the novel begins.');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('slide-step')).toHaveText('3 of 4');
    await expect(stage).toContainText('Sudan becomes independent on January 1.');
    // Back one.
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('slide-step')).toHaveText('2 of 4');

    // A click on an event goes straight to it.
    await stage.getByRole('button', { name: /1966/ }).click();
    await expect(page.getByTestId('slide-step')).toHaveText('4 of 4');
    await expect(stage).toContainText('ten years after independence');
    // After the last event the arrow leaves the slide.
    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('3 / 4');
  });

  test('Present draws a map from Yawp!’s own data, with a pin for each place, and steps through them', async ({ page, signIn, e2eContext }) => {
    for (const flag of KIT_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    // Nothing but Yawp! is asked for the map.
    const elsewhere: string[] = [];
    page.on('request', (request) => {
      const host = new URL(request.url()).host;
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) && /tile|map|geo/i.test(request.url())) elsewhere.push(request.url());
    });

    await page.goto(`/present/${conversationId}/${assistantId}`);
    await page.waitForLoadState('networkidle');
    const stage = page.getByTestId('slide-stage').first();
    // To the map: on to the timeline, through its four events, and off it.
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('slide-counter').last()).toHaveText('3 / 4');
    await expect(stage.locator('[data-template="map"]')).toBeVisible();

    const map = stage.getByTestId('slide-map');
    await expect(map).toBeVisible();
    await expect.poll(() => map.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(await map.getAttribute('src')).toContain('/api/lesson-planner-map.svg');
    await expect(stage.locator('[data-kit-role="mark"]')).toHaveCount(3);
    await expect(stage).toContainText('Sudan in 1956');
    await expect(stage).toContainText('Natural Earth');
    await expect(page.getByTestId('slide-step')).toHaveText('3 to step through');

    // London's pin is north and west of Khartoum's.
    const pins = await stage.locator('[data-kit-role="mark"]').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()).map((box) => ({ x: box.x, y: box.y })));
    expect(pins[2]!.y).toBeLessThan(pins[0]!.y);
    expect(pins[2]!.x).toBeLessThan(pins[0]!.x);

    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('slide-step')).toHaveText('1 of 3');
    await expect(stage).toContainText('Where the two Niles meet, and the capital.');
    await stage.getByRole('button', { name: 'London' }).click();
    await expect(page.getByTestId('slide-step')).toHaveText('3 of 3');
    await expect(stage).toContainText('Seven years of study, far from the river.');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('slide-counter').last()).toHaveText('4 / 4');
    expect(elsewhere).toEqual([]);
  });

  test('the studio: type on an event, add one, see one in focus; rename a place and its pin moves', async ({ page, signIn, e2eContext }) => {
    for (const flag of STUDIO_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/deck/${assistantId}`);
    const slide = page.getByTestId('deck-studio-slide');

    await page.getByRole('button', { name: /^Slide 2:/ }).click();
    await expect(slide.locator('[data-template="timeline"]')).toBeVisible();
    const steps = page.getByTestId('deck-studio-steps');
    await expect(steps).toContainText('check them before class');

    const third = slide.getByRole('textbox', { name: 'Event 3', exact: true });
    await third.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Sudan is independent');
    await expect(third).toHaveText('Sudan is independent');
    // Enter adds an event after it, ready to type over.
    await page.keyboard.press('Enter');
    const fourth = slide.getByRole('textbox', { name: 'Event 4', exact: true });
    await expect(fourth).toBeFocused();
    await page.keyboard.type('The army takes power');
    await expect(slide.getByRole('textbox', { name: 'Event 5', exact: true })).toHaveText('The novel is published');
    // One event in focus, as Present shows it: its sentence can be typed on too.
    await steps.getByRole('button', { name: 'Event 1' }).click();
    await expect(slide.getByRole('textbox', { name: 'Event 1 sentence' })).toHaveText('The Condominium begins: two flags, one ruler in practice.');

    // The map: Cairo becomes Alexandria, and Yawp! finds it.
    await page.getByRole('button', { name: /^Slide 3:/ }).click();
    await expect(slide.getByTestId('slide-map')).toBeVisible();
    await expect(page.getByTestId('deck-studio-steps')).toContainText('Cairo, Egypt');
    const before = await slide.locator('[data-kit-role="mark"]').nth(1).boundingBox();
    const place = slide.getByRole('textbox', { name: 'Place 2', exact: true });
    await place.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Alexandria');
    await page.getByLabel('Notes for you').click();
    await expect(page.getByTestId('deck-studio-steps')).toContainText('Alexandria, Egypt');
    const after = await slide.locator('[data-kit-role="mark"]').nth(1).boundingBox();
    // Alexandria is north and west of Cairo.
    expect(after!.y).toBeLessThan(before!.y);
    expect(after!.x).toBeLessThan(before!.x);

    // A place Yawp! does not have comes off the map, and the studio says so.
    await place.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Wad Hamid');
    await page.getByLabel('Notes for you').click();
    await expect(page.getByTestId('deck-studio-steps')).toContainText('Not found: Wad Hamid');
    await expect(slide.locator('[data-kit-role="mark"]')).toHaveCount(2);

    await page.getByTestId('deck-editor-save').click();
    await expect(page).toHaveURL(new RegExp(`/app/lesson-planner\\?c=${conversationId}`));
    const saved = await savedDeck(conversationId);
    expect(saved?.slides[1]?.events?.map((event) => event.title)).toEqual([
      'Britain and Egypt rule together',
      'Egyptian troops sent home',
      'Sudan is independent',
      'The army takes power',
      'The novel is published',
    ]);
    const places = saved?.slides[2]?.places ?? [];
    expect(places[0]).toMatchObject({ name: 'Khartoum', found: 'Khartoum, Sudan' });
    expect(places[1]).toEqual({ name: 'Wad Hamid', where: 'Egypt', note: 'The first stop on the way north.' });
    // Never stored: which event was in focus.
    expect(JSON.stringify(saved)).not.toContain('"focus"');
  });

  test('the older look draws each as a list: no line, no map, nothing lost', async ({ page, signIn, e2eContext }) => {
    for (const flag of ['lesson_planner_deck_v2', 'lesson_planner_deck_gallery'] as const) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/present/${conversationId}/${assistantId}`);
    await page.waitForLoadState('networkidle');
    const stage = page.getByTestId('slide-stage').first();
    await page.keyboard.press('ArrowRight');
    await expect(stage.locator('[data-theme="gallery"]')).toBeVisible();
    await expect(stage).toContainText('1899');
    await expect(stage).toContainText('Britain and Egypt rule together');
    // Stepped through all the same, so the arrows behave as they do in the kit's look.
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
    await expect(stage).toContainText('Khartoum');
    await expect(stage.getByTestId('slide-map')).toHaveCount(0);
  });
});
