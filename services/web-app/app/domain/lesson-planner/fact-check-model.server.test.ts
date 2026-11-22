import { describe, expect, mock, test } from 'bun:test';
import { factCheckCall } from './fact-check-model.server';

const attribution = () => ({
  organizationId: 'o',
  membershipId: 'm',
  route: 'r',
  requestId: 'q',
});

describe('factCheckCall', () => {
  test('Sonnet 5.5 at low effort, held to the schema, no other provider, no payload in the logs', async () => {
    const complete = mock(async () => '{"errors": []}');
    await factCheckCall(attribution, {
      model: 'claude-sonnet-5-5',
      complete: complete as never,
    })!('system', 'the lesson');
    expect(
      (complete.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    ).toMatchObject({
      model: 'claude-sonnet-5-5',
      outputConfig: { effort: 'low', format: { type: 'json_schema' } },
      allowFallbackProvider: false,
      logPayload: 'metadata-only',
      metadata: { feature: 'lesson-planner-fact-check' },
    });
  });

  test('the lesson repair is the same call, held to its own answer and logged as its own feature', async () => {
    const complete = mock(async () => '{"edits": []}');
    const schema = { type: 'object', properties: { edits: { type: 'array' } } };
    await factCheckCall(attribution, { model: 'claude-sonnet-5-5', complete: complete as never, schema, feature: 'lesson-planner-repair', maxTokens: 6_000 })!('system', 'the lesson');
    expect((complete.mock.calls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({
      maxTokens: 6_000,
      outputConfig: { format: { type: 'json_schema', schema } },
      metadata: { feature: 'lesson-planner-repair' },
    });
  });

  test('a model the account cannot use: the planner’s own checks instead', async () => {
    const models: string[] = [];
    const complete = mock(async (request: { model: string }) => {
      models.push(request.model);
      if (request.model === 'claude-sonnet-5-5')
        throw Object.assign(new Error('not found'), { status: 404 });
      return '{"errors": []}';
    });
    await factCheckCall(attribution, {
      model: 'claude-sonnet-5-5',
      fallbackModel: 'claude-sonnet-4-6',
      complete: complete as never,
    })!('s', 'p');
    expect(models).toEqual(['claude-sonnet-5-5', 'claude-sonnet-4-6']);
  });

  test('"off" turns it off', () => {
    expect(factCheckCall(attribution, { model: 'off' })).toBeUndefined();
  });
});
