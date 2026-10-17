import { createHash } from 'node:crypto';
import { beforeEach, expect, mock, test } from 'bun:test';
const findMany = mock();
let readOnly = false;
mock.module('~/cookie-session-storages/authentication.server', () => ({ authSessionStorage: { getSession: async () => ({ get: (key: string) => key === 'sessionId' ? 'session-one' : key === 'impersonationMode' && readOnly ? 'read-only' : undefined }) } }));
const request = new Request('http://localhost/app');
const isFreeTierEnabled = mock();
const isFeatureFlagEnabled = mock();
mock.module('~/utils/db.server', () => ({ prisma: { userTour: { findMany } } }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ isFreeTierEnabled, isFeatureFlagEnabled }));
const { loadGuidedTours, loadWaitingPreviewTours } = await import('./guided-tours.server');
const teacher = { role: 'TEACHER', organization: { id: 'free', plan: 'FREE_CLASSROOM' } };
beforeEach(() => {
  readOnly = false;
  for (const fn of [findMany, isFreeTierEnabled, isFeatureFlagEnabled]) fn.mockReset();
  findMany.mockResolvedValue([{ tourId: 'dashboard' }, { tourId: 'unknown' }]);
  isFreeTierEnabled.mockResolvedValue(true);
  isFeatureFlagEnabled.mockResolvedValue(true);
});
test('both flags must be enabled before any progress read', async () => {
  isFeatureFlagEnabled.mockResolvedValue(false);
  expect(await loadGuidedTours('u', teacher, request)).toBeNull();
  expect(findMany).not.toHaveBeenCalled();
  isFeatureFlagEnabled.mockResolvedValue(true);
  isFreeTierEnabled.mockResolvedValue(false);
  expect(await loadGuidedTours('u', teacher, request)).toBeNull();
  expect(findMany).not.toHaveBeenCalled();
});
test('ineligible memberships never read progress', async () => {
  for (const member of [{ ...teacher, role: 'STUDENT' }, { ...teacher, organization: { id: 'paid', plan: 'SCHOOL' } }]) {
    expect(await loadGuidedTours('u', member, request)).toBeNull();
  }
  expect(findMany).not.toHaveBeenCalled();
  expect(isFeatureFlagEnabled).not.toHaveBeenCalled();
});
test('targets the current organization and reads only the current user completed tours', async () => {
  expect(await loadGuidedTours('u', teacher, request)).toEqual({ finishedTourIds: ['dashboard'], storageScope: createHash('sha256').update('u:session-one').digest('hex') });
  expect(isFeatureFlagEnabled).toHaveBeenCalledWith('guided-tours', 'free');
  expect(findMany).toHaveBeenCalledWith({ where: { userId: 'u', status: 'completed' }, select: { tourId: true } });
});


test('waiting preview reads no progress with either flag off or during class preparation', async () => {
  const app = { status: 'SENT', organizationId: null };
  isFeatureFlagEnabled.mockResolvedValue(false);
  expect(await loadWaitingPreviewTours('u', app, request)).toBeNull();
  isFeatureFlagEnabled.mockResolvedValue(true);
  isFreeTierEnabled.mockResolvedValue(false);
  expect(await loadWaitingPreviewTours('u', app, request)).toBeNull();
  isFreeTierEnabled.mockResolvedValue(true);
  expect(await loadWaitingPreviewTours('u', { ...app, status: 'ACCOUNT_CREATED' }, request)).toBeNull();
  expect(findMany).not.toHaveBeenCalled();
});
test('waiting progress is scoped to the user and preview, without a membership', async () => {
  findMany.mockResolvedValue([{ tourId: 'dashboard' }, { tourId: 'waiting-preview' }]);
  expect(await loadWaitingPreviewTours('u', { status: 'MANUAL_REVIEW', organizationId: 'free' }, request))
    .toEqual({ finishedTourIds: ['waiting-preview'], storageScope: createHash('sha256').update('u:session-one').digest('hex') });
  expect(isFeatureFlagEnabled).toHaveBeenCalledWith('guided-tours', 'free');
});


test('read-only waiting sessions do not read progress or expose controls', async () => {
  readOnly = true;
  expect(await loadWaitingPreviewTours('u', { status: 'SENT', organizationId: null }, request)).toBeNull();
  expect(findMany).not.toHaveBeenCalled();
});
