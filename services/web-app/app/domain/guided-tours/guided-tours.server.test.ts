import { createHash } from 'node:crypto';
import { beforeEach, expect, mock, test } from 'bun:test';
const findMany = mock();
mock.module('~/cookie-session-storages/authentication.server', () => ({ authSessionStorage: { getSession: async () => ({ get: () => 'session-one' }) } }));
const request = new Request('http://localhost/app');
const isFreeTierEnabled = mock();
const isFeatureFlagEnabled = mock();
mock.module('~/utils/db.server', () => ({ prisma: { userTour: { findMany } } }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ isFreeTierEnabled, isFeatureFlagEnabled }));
const { loadGuidedTours } = await import('./guided-tours.server');
const teacher = { role: 'TEACHER', organization: { id: 'free', plan: 'FREE_CLASSROOM' } };
beforeEach(() => {
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
