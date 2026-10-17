import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { redirect } from 'react-router';

const requireUserId = mock();
const requireMembership = mock();
const isFeatureFlagEnabled = mock();
const readThesisEssayDeckAsset = mock();

mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ isFeatureFlagEnabled }));
// Every export: bun shares module mocks across the files of one run.
mock.module('~/domain/thesis-essay-decks/thesis-essay-decks.server', () => ({
  listAvailableThesisEssayDecks: mock(() => []),
  listAvailableThesisEssayMaterialSlugs: mock(() => new Set()),
  listPresentableThesisEssayDeckSlugs: mock(() => new Set()),
  readThesisEssayMaterial: mock(),
  readThesisEssayDeckScene: mock(),
  readThesisEssayDeckAsset,
}));

const { loader } = await import('./route');

function call(name: string) {
  return loader({
    request: new Request(`https://example.com/api/thesis-essay-deck-asset/${name}`),
    params: { '*': name },
  } as any) as Promise<Response>;
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    return ((await promise) as Response).status;
  } catch (thrown) {
    if (thrown instanceof Response) return thrown.status;
    throw thrown;
  }
}

describe('api.thesis-essay-deck-asset.$', () => {
  beforeEach(() => {
    for (const fn of [requireUserId, requireMembership, isFeatureFlagEnabled, readThesisEssayDeckAsset]) {
      fn.mockReset();
    }
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'm-1', role: 'TEACHER', organization: { id: 'org-1' } });
    isFeatureFlagEnabled.mockResolvedValue(true);
    readThesisEssayDeckAsset.mockResolvedValue(Buffer.from('image bytes'));
  });

  test('refuses a caller with no session', async () => {
    requireUserId.mockImplementation(() => {
      throw redirect('/auth/login');
    });
    await expect(call('fallen-man.jpg')).rejects.toBeDefined();
    expect(readThesisEssayDeckAsset).not.toHaveBeenCalled();
  });

  test('serves a teacher a deck image, with its type', async () => {
    const response = await call('icons/eye.png');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toContain('private');
    expect(readThesisEssayDeckAsset).toHaveBeenCalledWith('icons/eye.png');
  });

  test('is not there while the flag is off, or for students', async () => {
    isFeatureFlagEnabled.mockResolvedValue(false);
    expect(await statusOf(call('fallen-man.jpg'))).toBe(404);
    isFeatureFlagEnabled.mockResolvedValue(true);
    requireMembership.mockResolvedValue({ id: 'm-2', role: 'STUDENT', organization: { id: 'org-1' } });
    expect(await statusOf(call('fallen-man.jpg'))).toBe(404);
    expect(readThesisEssayDeckAsset).not.toHaveBeenCalled();
  });

  test('404s a path outside the asset folder without touching the disk', async () => {
    expect(await statusOf(call('../thesis-essay-decks.ts'))).toBe(404);
    expect(readThesisEssayDeckAsset).not.toHaveBeenCalled();
  });

  test('404s an image that is not there', async () => {
    readThesisEssayDeckAsset.mockResolvedValue(null);
    expect(await statusOf(call('missing.png'))).toBe(404);
  });
});
