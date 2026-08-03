import { describe, expect, it } from 'bun:test';
import { resolveClassInsightMockMode } from './class-insight-mock-mode';

function buildTestEnv(
  overrides: Partial<NodeJS.ProcessEnv> = {}
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DATABASE_PATH: 'test.db',
    DATABASE_URL: 'postgresql://test',
    SESSION_SECRET: 'test-session-secret',
    INTERNAL_COMMAND_TOKEN: 'test-command-token',
    HONEYPOT_SECRET: 'test-honeypot-secret',
    CACHE_DATABASE_PATH: 'test-cache.db',
    AWS_S3_BUCKET_FOR_VIDEOS: 'test-videos',
    AWS_S3_REGION_FOR_VIDEOS: 'us-east-1',
    ...overrides,
  };
}

describe('resolveClassInsightMockMode', () => {
  it('honors an explicit fixture mode', () => {
    expect(
      resolveClassInsightMockMode(buildTestEnv({
        NODE_ENV: 'development',
        CLASS_INSIGHT_MOCK_MODE: 'fixture',
        ANTHROPIC_API_KEY: 'sk-test',
      }))
    ).toEqual({ mode: 'fixture', usesFixture: true });
  });

  it('honors an explicit live mode', () => {
    expect(
      resolveClassInsightMockMode(buildTestEnv({
        NODE_ENV: 'development',
        CLASS_INSIGHT_MOCK_MODE: 'live',
      }))
    ).toEqual({ mode: 'live', usesFixture: false });
  });

  it('defaults to fixture in development without an API key', () => {
    expect(
      resolveClassInsightMockMode(buildTestEnv({
        NODE_ENV: 'development',
        ANTHROPIC_API_KEY: '',
      }))
    ).toEqual({ mode: 'fixture', usesFixture: true });
  });

  it('defaults to live in development when an API key is present', () => {
    expect(
      resolveClassInsightMockMode(buildTestEnv({
        NODE_ENV: 'development',
        ANTHROPIC_API_KEY: 'sk-test',
      }))
    ).toEqual({ mode: 'live', usesFixture: false });
  });
});
