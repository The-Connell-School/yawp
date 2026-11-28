/**
 * A small model's JSON answer, read leniently (the second look on the
 * preview, Nov 22, answered and nothing could be read).
 */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { jsonObjectSpans, readLenientJson } from './lenient-json';

const Shape = z.object({ pictures: z.array(z.object({ n: z.number() })) });

describe('readLenientJson', () => {
  test('JSON alone, in a code fence, or after a sentence', () => {
    expect(readLenientJson('{"pictures": [{"n": 1}]}', Shape)).toEqual({
      pictures: [{ n: 1 }],
    });
    expect(
      readLenientJson('```json\n{"pictures": [{"n": 2}]}\n```', Shape)
    ).toEqual({ pictures: [{ n: 2 }] });
    expect(
      readLenientJson('Here are my verdicts:\n{"pictures": []}', Shape)
    ).toEqual({ pictures: [] });
  });

  test('a note with braces after the JSON does not spoil it', () => {
    expect(
      readLenientJson(
        '{"pictures": [{"n": 1}]}\nNote: picture {2} was blurry.',
        Shape
      )
    ).toEqual({ pictures: [{ n: 1 }] });
  });

  test('braces inside strings are text, not structure', () => {
    expect(jsonObjectSpans('{"a": "a } brace", "b": {"c": 1}} tail')[0]).toBe(
      '{"a": "a } brace", "b": {"c": 1}}'
    );
  });

  test('the first object the schema accepts, or nothing', () => {
    expect(
      readLenientJson('{"draft": true} {"pictures": [{"n": 3}]}', Shape)
    ).toEqual({ pictures: [{ n: 3 }] });
    expect(readLenientJson('no JSON here', Shape)).toBeNull();
    expect(readLenientJson('{"pictures": "none"}', Shape)).toBeNull();
    expect(readLenientJson('{"pictures": [', Shape)).toBeNull();
  });
});
