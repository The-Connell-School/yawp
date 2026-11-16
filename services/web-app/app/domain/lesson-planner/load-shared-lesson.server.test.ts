import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { studentVersionKey } from './step-handout';

const findUnique = mock();
const findShareLink = mock();
mock.module('~/utils/db.server', () => ({ prisma: { lessonPlanConversation: { findUnique } } }));
mock.module('./lesson-share.server', () => ({ findShareLink }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isLessonPlannerEnabled: mock(async () => true),
  getLessonPlannerReviewFlags: mock(async () => ({})),
}));
const { loadSharedLesson } = await import('./load-shared-lesson.server');

const QUESTION = 'In two sentences, explain how weathering differs from erosion. Use one example of each.';
const EXIT_TICKET = `**Exit ticket:** ${QUESTION}

**What to look for when you sort them:**
- Got it: weathering breaks rock down; erosion moves the pieces.
- Almost: names both processes but confuses movement.
- Not yet: says they are the same thing.

**What to do with each pile tomorrow:**
Reteach movement to the not-yet group before moving on.`;
const STARTER = 'What changed in your neighborhood after the last storm?';

function material(id: string, kind: string, title: string, content: string) {
  return {
    id, kind, title, content, audience: 'student', sourceCreatedAt: new Date('2026-11-15'),
    position: 0, minutes: 4, stepType: null, label: null, hasHandout: true,
    writing: null, yawpAssignmentId: null, yawpCreatedAt: null,
    studentVersion: null, studentVersionKey: null,
  };
}

beforeEach(() => {
  findShareLink.mockReset().mockResolvedValue({
    audience: 'student', includes: ['handouts', 'daily-pages'],
    conversation: { id: 'lesson' }, note: null, body: null,
  });
  findUnique.mockReset().mockResolvedValue({
    organizationId: 'org', title: 'Weathering and erosion', packetTitle: null,
    lessonClassLabel: 'Earth Science', periodMinutes: 50,
    materials: [
      material('starter', 'class-starter', 'Class Starter', STARTER),
      material('exit', 'exit-ticket', 'Exit ticket: Weathering and erosion', EXIT_TICKET),
      { ...material('key', 'answer-key', 'Answer key', 'Teacher-only correct answers.'), audience: 'teacher', hasHandout: false },
    ],
  });
});

describe('student shared exit tickets', () => {
  test('prompts and handouts contain only the question, without teacher guidance or markdown marks', async () => {
    const lesson = (await loadSharedLesson('token'))!;
    expect(lesson.prompts.find((p) => p.id === 'exit')?.content).toBe(QUESTION);
    expect(lesson.handouts.find((h) => h.id === 'exit')?.content).toBe(QUESTION);
    expect(lesson.prompts.find((p) => p.id === 'starter')?.content).toBe(STARTER);
    expect(lesson.handouts.find((h) => h.id === 'starter')?.content).toBe(STARTER);
    expect(JSON.stringify(lesson)).not.toContain('Teacher-only correct answers');
  });

  test('also filters exit tickets stored as plan steps, including their cached handout version', async () => {
    const conversation = await findUnique();
    conversation.materials = [{
      ...material('closing', 'step', 'Exit ticket', EXIT_TICKET),
      stepType: 'closing', writing: true,
      studentVersion: EXIT_TICKET, studentVersionKey: studentVersionKey(EXIT_TICKET),
    }];
    const lesson = (await loadSharedLesson('token'))!;
    expect(lesson.prompts[0]?.content).toBe(QUESTION);
    expect(lesson.handouts[0]?.content).toBe(QUESTION);
  });

  test.each(['sub', 'admin', 'family'])('keeps the existing %s audience content intact', async (audience) => {
    const link = await findShareLink();
    link.audience = audience;
    const lesson = (await loadSharedLesson('token'))!;
    expect(lesson.prompts.find((p) => p.id === 'exit')?.content).toBe(EXIT_TICKET);
    expect(lesson.handouts.find((h) => h.id === 'exit')?.content).toBe(EXIT_TICKET);
  });
});
