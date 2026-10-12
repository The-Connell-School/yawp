import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { redirect } from 'react-router';

const requireUserId = mock();
const requireMembership = mock();
const isFeatureFlagEnabled = mock();
const readThesisEssayDeck = mock();

mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ isFeatureFlagEnabled }));
mock.module('~/domain/thesis-essay-decks/thesis-essay-decks.server', () => ({
  readThesisEssayDeck,
}));

const { loader } = await import('./route');

function call(slug: string) {
  return loader({
    request: new Request(`https://example.com/api/thesis-essay-deck/${slug}`),
    params: { slug },
  } as any) as Promise<Response>;
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    const response = (await promise) as Response;
    return response.status;
  } catch (thrown) {
    if (thrown instanceof Response) return thrown.status;
    // invariantResponse throws a Response; anything else is a real failure.
    throw thrown;
  }
}

describe('api.thesis-essay-deck.$slug', () => {
  beforeEach(() => {
    for (const fn of [requireUserId, requireMembership, isFeatureFlagEnabled, readThesisEssayDeck]) {
      fn.mockReset();
    }
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'm-1', role: 'TEACHER', organization: { id: 'org-1' } });
    isFeatureFlagEnabled.mockResolvedValue(true);
    readThesisEssayDeck.mockResolvedValue(Buffer.from('PK deck bytes'));
  });

  test('refuses a caller with no session', async () => {
    requireUserId.mockImplementation(() => {
      throw redirect('/auth/login');
    });
    await expect(call('lesson-2-pre-writing')).rejects.toBeDefined();
    expect(readThesisEssayDeck).not.toHaveBeenCalled();
  });

  test('serves a teacher the deck as a .pptx download', async () => {
    const response = await call('lesson-2-pre-writing');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    expect(response.headers.get('Content-Disposition')).toContain('attachment;');
    expect(response.headers.get('Content-Disposition')).toContain('.pptx');
    expect(response.headers.get('Cache-Control')).toContain('private');
    expect(await response.text()).toBe('PK deck bytes');
    expect(isFeatureFlagEnabled).toHaveBeenCalledWith('thesis_essay_decks', 'org-1');
  });

  test('is not there while the flag is off', async () => {
    isFeatureFlagEnabled.mockResolvedValue(false);
    expect(await statusOf(call('lesson-2-pre-writing'))).toBe(404);
    expect(readThesisEssayDeck).not.toHaveBeenCalled();
  });

  test('is not there for students', async () => {
    requireMembership.mockResolvedValue({ id: 'm-2', role: 'STUDENT', organization: { id: 'org-1' } });
    expect(await statusOf(call('lesson-2-pre-writing'))).toBe(404);
    expect(readThesisEssayDeck).not.toHaveBeenCalled();
  });

  test('404s an unknown slug without touching the disk', async () => {
    expect(await statusOf(call('../../etc/passwd'))).toBe(404);
    expect(readThesisEssayDeck).not.toHaveBeenCalled();
  });

  test('404s a known deck that has not been built yet', async () => {
    readThesisEssayDeck.mockResolvedValue(null);
    expect(await statusOf(call('lesson-7-titles'))).toBe(404);
  });
});
