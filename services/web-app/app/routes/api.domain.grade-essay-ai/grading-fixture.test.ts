import { afterEach, describe, expect, test } from 'bun:test';
import { shouldUseDeterministicGradingFixture } from './route';

describe('shouldUseDeterministicGradingFixture', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('uses fixtures in development when the model key is missing', () => {
    process.env.NODE_ENV = 'development';
    process.env.ANTHROPIC_API_KEY = '';
    expect(
      shouldUseDeterministicGradingFixture(new Request('http://localhost'), false)
    ).toBe(true);
  });

  test('calls the live model when a key is configured', () => {
    process.env.NODE_ENV = 'development';
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    expect(
      shouldUseDeterministicGradingFixture(new Request('http://localhost'), false)
    ).toBe(false);
  });
});
