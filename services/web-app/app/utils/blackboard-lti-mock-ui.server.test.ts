import { afterEach, describe, expect, test } from 'bun:test';
import { isBlackboardLtiMockUiEnabled } from './blackboard-lti-mock-ui.server';

const keys = [
  'NODE_ENV',
  'YAWP_ENVIRONMENT',
  'BLACKBOARD_LTI_MOCK_URL',
  'PREVIEW_ACCESS_GATE',
  'PREVIEW_DATA_MODE',
  'DATABASE_URL',
] as const;

const original: Record<string, string | undefined> = {};
for (const key of keys) original[key] = process.env[key];

afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe('isBlackboardLtiMockUiEnabled', () => {
  test('is off in production even if a mock URL is set', () => {
    process.env.NODE_ENV = 'production';
    process.env.YAWP_ENVIRONMENT = 'production';
    process.env.BLACKBOARD_LTI_MOCK_URL = 'http://127.0.0.1:9473';
    process.env.PREVIEW_ACCESS_GATE = 'on';
    process.env.PREVIEW_DATA_MODE = 'seed';
    expect(isBlackboardLtiMockUiEnabled()).toBe(false);
  });

  test('is off when the mock URL is missing', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/yawp';
    delete process.env.BLACKBOARD_LTI_MOCK_URL;
    expect(isBlackboardLtiMockUiEnabled()).toBe(false);
  });

  test('is on for local development when the mock URL is configured', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/yawp';
    process.env.BLACKBOARD_LTI_MOCK_URL = 'http://127.0.0.1:9473';
    delete process.env.PREVIEW_ACCESS_GATE;
    delete process.env.YAWP_ENVIRONMENT;
    expect(isBlackboardLtiMockUiEnabled()).toBe(true);
  });

  test('is on for access-gated previews', () => {
    process.env.NODE_ENV = 'production';
    process.env.YAWP_ENVIRONMENT = 'preview';
    process.env.PREVIEW_ACCESS_GATE = 'on';
    process.env.PREVIEW_DATA_MODE = 'seed';
    process.env.BLACKBOARD_LTI_MOCK_URL = 'http://blackboard-lti-mock:9473';
    expect(isBlackboardLtiMockUiEnabled()).toBe(true);
  });
});
