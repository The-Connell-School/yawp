/**
 * The small model behind the picture editor and the second look.
 */
import { describe, expect, mock, test } from 'bun:test';
import {
  DEFAULT_PICTURE_MODEL,
  pictureModelCalls,
} from './picture-model.server';

const attribution = () => ({
  organizationId: 'o',
  membershipId: 'm',
  route: 'r',
  requestId: 'q',
});

describe('pictureModelCalls', () => {
  test('Haiku 5.5 at low effort, held to a JSON schema, no other provider, its answer logged but never its input', async () => {
    const complete = mock(async () => '{"slides": []}');
    const calls = pictureModelCalls(attribution, {
      model: DEFAULT_PICTURE_MODEL,
      complete: complete as never,
    });
    expect(await calls.name!('system', 'prompt')).toBe('{"slides": []}');
    const request = (
      complete.mock.calls[0] as unknown as [Record<string, unknown>]
    )[0];
    expect(request).toMatchObject({
      model: 'claude-haiku-5-5',
      system: 'system',
      messages: [{ content: 'prompt' }],
      outputConfig: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: { required: ['author', 'slides', 'events'] },
        },
      },
      allowFallbackProvider: false,
      logPayload: 'response-only',
      metadata: { feature: 'lesson-planner-picture-editor' },
    });
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  test('the second look sends its content blocks as they are', async () => {
    const complete = mock(async () => '{"pictures": []}');
    const blocks = [{ type: 'text', text: 'Picture 1.' }];
    await pictureModelCalls(attribution, {
      model: DEFAULT_PICTURE_MODEL,
      complete: complete as never,
    }).look!('system', blocks);
    const request = (
      complete.mock.calls[0] as unknown as [Record<string, unknown>]
    )[0];
    expect(request).toMatchObject({
      messages: [{ content: blocks }],
      metadata: { feature: 'lesson-planner-picture-look' },
      outputConfig: { format: { schema: { required: ['pictures'] } } },
    });
  });

  test('a model that refuses the effort setting is asked once more without it; any other failure is passed on', async () => {
    let n = 0;
    const complete = mock(async (request: Record<string, unknown>) => {
      n += 1;
      if (request.outputConfig)
        throw Object.assign(new Error('bad request'), { status: 400 });
      return 'ok';
    });
    expect(
      await pictureModelCalls(attribution, { complete: complete as never })
        .name!('s', 'p')
    ).toBe('ok');
    expect(n).toBe(2);
    const failing = mock(async () => {
      throw Object.assign(new Error('overloaded'), { status: 529 });
    });
    await expect(
      pictureModelCalls(attribution, { complete: failing as never }).name!(
        's',
        'p'
      )
    ).rejects.toThrow('overloaded');
    expect(failing.mock.calls.length).toBe(1);
  });

  test('"off" turns both calls off', () => {
    expect(pictureModelCalls(attribution, { model: 'off' })).toEqual({});
  });
});
