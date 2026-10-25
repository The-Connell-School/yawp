import { describe, expect, test } from 'bun:test';
import {
  isAbortedManifestPatchConsoleMessage,
  isIgnorableControlledNavigationErrorMessage,
} from './test-helpers.ts';

describe('isAbortedManifestPatchConsoleMessage', () => {
  test('matches the abort message when Playwright appends a stack trace', () => {
    const text = [
      'Failed to fetch manifest patches TypeError: Failed to fetch',
      '    at patchedFetch (teaching-access-context.tsx:50:10)',
    ].join('\n');
    expect(isAbortedManifestPatchConsoleMessage(text)).toBe(true);
  });

  test('matches the exact single-line message', () => {
    expect(
      isAbortedManifestPatchConsoleMessage(
        'Failed to fetch manifest patches TypeError: Failed to fetch',
      ),
    ).toBe(true);
  });

  test('does not match other console errors', () => {
    expect(isAbortedManifestPatchConsoleMessage('Failed to fetch manifest patches Error: boom')).toBe(
      false,
    );
    expect(isAbortedManifestPatchConsoleMessage('TypeError: Failed to fetch')).toBe(false);
  });
});

describe('isIgnorableControlledNavigationErrorMessage', () => {
  test('includes manifest abort and Suspense hydration races', () => {
    expect(
      isIgnorableControlledNavigationErrorMessage(
        'Failed to fetch manifest patches TypeError: Failed to fetch',
      ),
    ).toBe(true);
    expect(
      isIgnorableControlledNavigationErrorMessage(
        'This Suspense boundary received an update before it finished hydrating. This caused the boundary to switch to client rendering.',
      ),
    ).toBe(true);
  });

  test('does not ignore unrelated errors', () => {
    expect(isIgnorableControlledNavigationErrorMessage('Uncaught TypeError: boom')).toBe(
      false,
    );
  });

  test('matches Suspense hydration text as thrown page errors (reporter/planner breakpoints)', () => {
    const pageErrorMessage =
      'This Suspense boundary received an update before it finished hydrating. This caused the boundary to switch to client rendering. The usual way to fix this is to wrap the original update in startTransition.';
    expect(isIgnorableControlledNavigationErrorMessage(pageErrorMessage)).toBe(
      true,
    );
  });
});
