import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { redirect } from 'react-router';

const requireUserId = mock();
const requireMembership = mock();
const isFeatureFlagEnabled = mock();
const readThesisEssayDeckScene = mock();

mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ isFeatureFlagEnabled }));
// Every export: bun shares module mocks across the files of one run.
mock.module('~/domain/thesis-essay-decks/thesis-essay-decks.server', () => ({
  listAvailableThesisEssayDecks: mock(() => []),
  listAvailableThesisEssayMaterialSlugs: mock(() => new Set()),
  listPresentableThesisEssayDeckSlugs: mock(() => new Set()),
  readThesisEssayMaterial: mock(),
  readThesisEssayDeckAsset: mock(),
  readThesisEssayDeckScene,
}));

const { loader } = await import('./route');

const SCENE = { title: 'How to Write a Thesis Statement', slides: [{ background: 'F7F5EE', elements: [], notes: 'n' }] };

function call(slug: string) {
  return loader({
    request: new Request(`https://example.com/present/thesis-essay/${slug}`),
    params: { slug },
  } as any);
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (thrown) {
    if (thrown instanceof Response) return thrown.status;
    throw thrown;
  }
}

describe('present.thesis-essay.$slug', () => {
  beforeEach(() => {
    for (const fn of [requireUserId, requireMembership, isFeatureFlagEnabled, readThesisEssayDeckScene]) {
      fn.mockReset();
    }
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'm-1', role: 'TEACHER', organization: { id: 'org-1' } });
    isFeatureFlagEnabled.mockResolvedValue(true);
    readThesisEssayDeckScene.mockResolvedValue(SCENE);
  });

  test('refuses a caller with no session', async () => {
    requireUserId.mockImplementation(() => {
      throw redirect('/auth/login');
    });
    await expect(call('lesson-3-thesis-statement')).rejects.toBeDefined();
  });

  test('gives a teacher the deck to present, with its lesson', async () => {
    const data = await call('lesson-3-thesis-statement');
    expect(data.scene).toEqual(SCENE);
    expect(data.lesson).toBe('Lesson 3 · Thesis Statement');
    expect(data.slug).toBe('lesson-3-thesis-statement');
  });

  test('is not there while the flag is off, or for students', async () => {
    isFeatureFlagEnabled.mockResolvedValue(false);
    expect(await statusOf(call('lesson-3-thesis-statement'))).toBe(404);
    isFeatureFlagEnabled.mockResolvedValue(true);
    requireMembership.mockResolvedValue({ id: 'm-2', role: 'STUDENT', organization: { id: 'org-1' } });
    expect(await statusOf(call('lesson-3-thesis-statement'))).toBe(404);
  });

  test('404s a lesson plan, a handout or an unknown slug', async () => {
    for (const slug of ['lesson-3-thesis-statement-lesson-plan', 'student-sign-up', 'nope']) {
      expect(await statusOf(call(slug))).toBe(404);
    }
    expect(readThesisEssayDeckScene).not.toHaveBeenCalled();
  });

  test('404s a deck whose scene is not there', async () => {
    readThesisEssayDeckScene.mockResolvedValue(null);
    expect(await statusOf(call('lesson-3-thesis-statement'))).toBe(404);
  });
});
