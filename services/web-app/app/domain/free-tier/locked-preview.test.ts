import { expect, test } from 'bun:test';
import { isLockedPreviewStatus, isLockedPreviewRequestAllowed } from './locked-preview';
import { LOCKED_PREVIEW_DENIED_MUTATIONS } from './locked-preview-mutations';

test('only pre-approval application states are locked', () => {
  for (const status of ['ACCOUNT_CREATED', 'ADMIN_SUBMITTED', 'SENT', 'MANUAL_REVIEW'])
    expect(isLockedPreviewStatus(status)).toBe(true);
  for (const status of ['APPROVED', 'REJECTED', 'EXPIRED', 'LEAD'])
    expect(isLockedPreviewStatus(status)).toBe(false);
});

test('preparation, resend and logout actions stay available while app reads are open', () => {
  for (const method of ['GET', 'HEAD']) {
    for (const path of [
      '/app',
      '/app/my-classes',
      '/app/assignment-types/at-1',
      '/app/free-tier/pending',
      '/api/image/course/img-1',
    ])
      expect(isLockedPreviewRequestAllowed(method, path)).toBe(true);
    expect(isLockedPreviewRequestAllowed('GET', '/api/guided-tours')).toBe(false);
  }
  for (const path of ['/app/free-tier/onboarding', '/app/free-tier/pending', '/auth/logout'])
    expect(isLockedPreviewRequestAllowed('POST', path)).toBe(true);
});

test('crafted requests cannot mutate teaching routes or resource APIs', () => {
  for (const path of LOCKED_PREVIEW_DENIED_MUTATIONS)
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
      expect(isLockedPreviewRequestAllowed(method, path)).toBe(false);
});

test('only the exact tour POST enters its own eligibility and intent checks', () => {
  expect(isLockedPreviewRequestAllowed('POST', '/api/guided-tours')).toBe(true);
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE'])
    expect(isLockedPreviewRequestAllowed(method, '/api/guided-tours')).toBe(false);
  expect(isLockedPreviewRequestAllowed('POST', '/api/guided-tours/anything')).toBe(false);
});
