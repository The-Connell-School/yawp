import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test';

const ORIGINAL_COMPOSITION_FLAG = process.env.COMPOSITION_PRACTICE_ENABLED;

const requireUserId = mock();
const requireMembership = mock();
const getLLMCompletion = mock();
const getLoungeModuleLinkForLesson = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/db.server', () => ({
  prisma: { class: { findMany: mock().mockResolvedValue([]) } },
}));
mock.module('~/utils/writing-lessons/lounge-links.server', () => ({
  getLoungeModuleLinkForLesson,
}));
// Mock the leaf LLM call (not the generation/feedback modules) so this test
// never clobbers the module-as-subject in the generation/feedback unit tests.
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion,
}));

const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

afterEach(() => {
  if (ORIGINAL_COMPOSITION_FLAG === undefined) {
    delete process.env.COMPOSITION_PRACTICE_ENABLED;
  } else {
    process.env.COMPOSITION_PRACTICE_ENABLED = ORIGINAL_COMPOSITION_FLAG;
  }
});

describe('writing lesson detail route', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    getLLMCompletion.mockReset();
    getLoungeModuleLinkForLesson.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org', writingPracticeEnabled: true },
    });
  });

  test('loads a lesson by direct URL with its practice prompts', async () => {
    const response = await loader({
      request: new Request(
        'https://example.test/app/writing-lessons/revising-for-wordiness'
      ),
      params: { lessonSlug: 'revising-for-wordiness' },
      context: {} as never,
    } as never);

    expect(response.data.lesson.slug).toBe('revising-for-wordiness');
    expect(response.data.lessonBody.length).toBeGreaterThan(0);
    // The practice itself runs on the session route; the lesson page only
    // needs enough to launch a set and size the teacher's assign panel.
    expect(response.data.practicePrompts.length).toBeGreaterThan(0);
  });

  test('links teachers on a composition lesson to the Lounge module', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', name: 'Org', writingPracticeEnabled: true },
    });
    const link = {
      trainingId: 'training-1',
      trainingTitle: 'The Thesis-Driven Essay',
      moduleId: 'module-1',
      moduleTitle: 'Lesson 3: Developing a Thesis Statement',
    };
    getLoungeModuleLinkForLesson.mockResolvedValue(link);

    const response = await loader({
      request: new Request(
        'https://example.test/app/writing-lessons/thesis-statements'
      ),
      params: { lessonSlug: 'thesis-statements' },
      context: {} as never,
    } as never);

    expect(response.data.loungeModule).toEqual(link);
    expect(getLoungeModuleLinkForLesson).toHaveBeenCalledWith(
      'thesis-statements',
      'teacher-1'
    );
  });

  test('does not resolve a Lounge link for students', async () => {
    const response = await loader({
      request: new Request(
        'https://example.test/app/writing-lessons/thesis-statements'
      ),
      params: { lessonSlug: 'thesis-statements' },
      context: {} as never,
    } as never);

    expect(response.data.loungeModule).toBeNull();
    expect(getLoungeModuleLinkForLesson).not.toHaveBeenCalled();
  });

  test('does not resolve a Lounge link on grammar lessons', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', name: 'Org', writingPracticeEnabled: true },
    });

    const response = await loader({
      request: new Request(
        'https://example.test/app/writing-lessons/revising-for-wordiness'
      ),
      params: { lessonSlug: 'revising-for-wordiness' },
      context: {} as never,
    } as never);

    expect(response.data.loungeModule).toBeNull();
    expect(getLoungeModuleLinkForLesson).not.toHaveBeenCalled();
  });
});
