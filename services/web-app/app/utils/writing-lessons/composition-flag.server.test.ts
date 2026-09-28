import { afterEach, describe, expect, test } from 'bun:test';

import { isCompositionPracticeEnabled } from './composition-flag.server';

const ORIGINAL_FLAG = process.env.COMPOSITION_PRACTICE_ENABLED;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  restore('COMPOSITION_PRACTICE_ENABLED', ORIGINAL_FLAG);
  restore('NODE_ENV', ORIGINAL_NODE_ENV);
});

describe('isCompositionPracticeEnabled', () => {
  test('explicit truthy values force the flag on', () => {
    process.env.NODE_ENV = 'production';
    for (const value of ['true', '1', 'TRUE', ' true ']) {
      process.env.COMPOSITION_PRACTICE_ENABLED = value;
      expect(isCompositionPracticeEnabled()).toBe(true);
    }
  });

  test('explicit falsy values force the flag off even outside production', () => {
    process.env.NODE_ENV = 'development';
    for (const value of ['false', '0', 'FALSE']) {
      process.env.COMPOSITION_PRACTICE_ENABLED = value;
      expect(isCompositionPracticeEnabled()).toBe(false);
    }
  });

  test('defaults on outside production when unset', () => {
    delete process.env.COMPOSITION_PRACTICE_ENABLED;
    process.env.NODE_ENV = 'development';
    expect(isCompositionPracticeEnabled()).toBe(true);
  });

  test('defaults off in production when unset', () => {
    delete process.env.COMPOSITION_PRACTICE_ENABLED;
    process.env.NODE_ENV = 'production';
    expect(isCompositionPracticeEnabled()).toBe(false);
  });
});
