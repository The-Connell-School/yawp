import { describe, expect, test } from 'bun:test';
import {
  isAbortedManifestPatchConsoleMessage,
  isIgnorableControlledNavigationConsoleMessage,
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

describe('isIgnorableControlledNavigationConsoleMessage', () => {
  test('includes manifest abort and Suspense hydration races', () => {
    expect(
      isIgnorableControlledNavigationConsoleMessage(
        'Failed to fetch manifest patches TypeError: Failed to fetch',
      ),
    ).toBe(true);
    expect(
      isIgnorableControlledNavigationConsoleMessage(
        'This Suspense boundary received an update before it finished hydrating. This caused the boundary to switch to client rendering.',
      ),
    ).toBe(true);
  });

  test('does not ignore unrelated console errors', () => {
    expect(isIgnorableControlledNavigationConsoleMessage('Uncaught TypeError: boom')).toBe(
      false,
    );
  });
});
