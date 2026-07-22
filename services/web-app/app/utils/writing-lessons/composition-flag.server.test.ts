import { afterEach, describe, expect, test } from 'bun:test';

import { isCompositionPracticeEnabled } from './composition-flag.server';

const ORIGINAL_FLAG = process.env.COMPOSITION_DRILLS_ENABLED;

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  restore('COMPOSITION_DRILLS_ENABLED', ORIGINAL_FLAG);
});

describe('isCompositionPracticeEnabled', () => {
  test('is default-off and follows only the organization gate', () => {
    delete process.env.COMPOSITION_DRILLS_ENABLED;
    expect(isCompositionPracticeEnabled(undefined)).toBe(false);
    expect(isCompositionPracticeEnabled(false)).toBe(false);
    expect(isCompositionPracticeEnabled(true)).toBe(true);
  });

  test('the environment can kill but never enable a tenant', () => {
    for (const value of ['false', '0', 'FALSE']) {
      process.env.COMPOSITION_DRILLS_ENABLED = value;
      expect(isCompositionPracticeEnabled(true)).toBe(false);
    }

    process.env.COMPOSITION_DRILLS_ENABLED = 'true';
    expect(isCompositionPracticeEnabled(false)).toBe(false);
    expect(isCompositionPracticeEnabled(true)).toBe(true);
  });
});
