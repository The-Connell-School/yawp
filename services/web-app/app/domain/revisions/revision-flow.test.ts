import { describe, expect, test } from 'bun:test';

import {
  resolveRevisionAccess,
  resolveRevisionDenialRedirect,
  resolveRevisionEntryPath,
} from './revision-flow';

const ids = { submissionId: 'sub-1', documentId: 'doc-1' };
const legacyPath = '/app/documents/doc-1?revise=1';

describe('resolveRevisionEntryPath', () => {
  test('keeps the legacy document path while the flag is off', () => {
    expect(
      resolveRevisionEntryPath({
        ...ids,
        revisionFlowEnabled: false,
        isReleased: true,
      })
    ).toBe(legacyPath);
  });

  test('points at the split screen once the flag is on and the grade is released', () => {
    expect(
      resolveRevisionEntryPath({
        ...ids,
        revisionFlowEnabled: true,
        isReleased: true,
      })
    ).toBe('/app/revise/sub-1');
  });

  test('falls back to the legacy path when no grade has been released', () => {
    expect(
      resolveRevisionEntryPath({
        ...ids,
        revisionFlowEnabled: true,
        isReleased: false,
      })
    ).toBe(legacyPath);
  });

  test('falls back to the legacy path for a withdrawn submission', () => {
    expect(
      resolveRevisionEntryPath({
        ...ids,
        revisionFlowEnabled: true,
        isReleased: true,
        isWithdrawn: true,
      })
    ).toBe(legacyPath);
  });
});

describe('resolveRevisionAccess', () => {
  const allowed = {
    revisionFlowEnabled: true,
    isOwner: true,
    isReleased: true,
    isWithdrawn: false,
  };

  test('allows the owner of a released submission', () => {
    expect(resolveRevisionAccess(allowed)).toEqual({ allowed: true });
  });

  test('denies everyone while the flag is off', () => {
    expect(
      resolveRevisionAccess({ ...allowed, revisionFlowEnabled: false })
    ).toEqual({ allowed: false, reason: 'flag-off' });
  });

  test('denies a viewer who does not own the document', () => {
    expect(resolveRevisionAccess({ ...allowed, isOwner: false })).toEqual({
      allowed: false,
      reason: 'not-owner',
    });
  });

  test('denies a submission whose grade has not been released', () => {
    expect(resolveRevisionAccess({ ...allowed, isReleased: false })).toEqual({
      allowed: false,
      reason: 'not-released',
    });
  });

  test('denies a withdrawn submission before the release check', () => {
    expect(
      resolveRevisionAccess({
        ...allowed,
        isWithdrawn: true,
        isReleased: false,
      })
    ).toEqual({ allowed: false, reason: 'withdrawn' });
  });
});

describe('resolveRevisionDenialRedirect', () => {
  test('sends a flag-off student to the legacy draft editor', () => {
    expect(
      resolveRevisionDenialRedirect({ ...ids, reason: 'flag-off' })
    ).toMatchObject({ path: legacyPath, type: 'message' });
  });

  test('sends a withdrawn submission to the legacy draft editor', () => {
    expect(
      resolveRevisionDenialRedirect({ ...ids, reason: 'withdrawn' })
    ).toMatchObject({ path: legacyPath, type: 'message' });
  });

  test('sends an unreleased submission back to the submission page', () => {
    expect(
      resolveRevisionDenialRedirect({ ...ids, reason: 'not-released' })
    ).toMatchObject({ path: '/app/submissions/sub-1', type: 'message' });
  });

  test('reports a non-owner as an error', () => {
    expect(
      resolveRevisionDenialRedirect({ ...ids, reason: 'not-owner' })
    ).toMatchObject({ path: '/app/submissions/sub-1', type: 'error' });
  });
});
