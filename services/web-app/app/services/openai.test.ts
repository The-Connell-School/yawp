import { describe, expect, test } from 'bun:test';
import { getOpenAiClientOptions } from './openai';

describe('OpenAI service configuration', () => {
  test('creates client options from an API key without requiring an org id', () => {
    expect(
      getOpenAiClientOptions({
        OPENAI_API_KEY: 'test-key',
      })
    ).toEqual({ apiKey: 'test-key' });
  });

  test('includes the org id when it is configured', () => {
    expect(
      getOpenAiClientOptions({
        OPENAI_API_KEY: 'test-key',
        OPENAI_ORG_ID: 'org-test',
      })
    ).toEqual({
      apiKey: 'test-key',
      organization: 'org-test',
    });
  });

  test('does not create client options without an API key', () => {
    expect(
      getOpenAiClientOptions({
        OPENAI_ORG_ID: 'org-test',
      })
    ).toBeUndefined();
  });
});
