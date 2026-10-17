import { expect, test } from 'bun:test';
import { isLockedPreviewStatus, isLockedPreviewRequestAllowed } from './locked-preview';

test('only pre-approval application states are locked', () => {
  for (const status of ['ACCOUNT_CREATED', 'ADMIN_SUBMITTED', 'SENT', 'MANUAL_REVIEW'])
    expect(isLockedPreviewStatus(status)).toBe(true);
  for (const status of ['APPROVED', 'REJECTED', 'EXPIRED', 'LEAD'])
    expect(isLockedPreviewStatus(status)).toBe(false);
});

test('preview and waiting reads are exact paths; preparation and approval actions stay available', () => {
  for (const method of ['GET', 'HEAD']) {
    for (const path of ['/app/free-tier/preview', '/app/free-tier/pending', '/app/free-tier/onboarding'])
      expect(isLockedPreviewRequestAllowed(method, path)).toBe(true);
  }
  for (const path of ['/app/free-tier/onboarding', '/app/free-tier/pending', '/auth/logout'])
    expect(isLockedPreviewRequestAllowed('POST', path)).toBe(true);
  expect(isLockedPreviewRequestAllowed('POST', '/app/free-tier/preview')).toBe(false);
  expect(isLockedPreviewRequestAllowed('GET', '/app/free-tier/preview/anything')).toBe(false);
});

test('crafted requests cannot enter teaching routes or resource APIs', () => {
  const denied = ['/app', '/app/assignments', '/app/my-classes/class',
    '/api/domain/assignments/create', '/api/domain/lesson-planner',
    '/api/domain/lesson-planner/packet', '/app/lesson-planner',
    '/app/lesson-planner/conversation/packet.pdf', '/app/reporter',
    '/api/domain/reporter', '/api/invitations', '/app/organization',
    '/app/free-tier/pending-bypass'];
  for (const path of denied)
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'])
      expect(isLockedPreviewRequestAllowed(method, path)).toBe(false);
});
