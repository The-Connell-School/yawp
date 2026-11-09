import { expect, test } from 'bun:test';

const { loadGuidedTours, loadWaitingPreviewTours } = await import('./guided-tours.server');
const request = new Request('http://localhost/app');
const teacher = { role: 'TEACHER', organization: { id: 'free', plan: 'FREE_CLASSROOM' } };

test('guided tours are disabled after flag removal', async () => {
  expect(await loadGuidedTours('u', teacher, request)).toBeNull();
  expect(
    await loadWaitingPreviewTours(
      'u',
      { status: 'SENT', organizationId: 'free' },
      request
    )
  ).toBeNull();
});
