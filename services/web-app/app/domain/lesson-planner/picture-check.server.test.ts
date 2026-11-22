/**
 * The second look (Nov 22, night): a small model sees each found picture
 * beside what its slide asked for, keeps it or not, and writes its alt text.
 */
import { describe, expect, test } from 'bun:test';
import {
  readSecondLookAnswer,
  secondLook,
  secondLookContent,
  type LookCandidate,
} from './picture-check.server';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const CANDIDATES: LookCandidate[] = [
  {
    n: 1,
    subject: 'First dust storms',
    words: 'Ten years that changed America. 1932: First dust storms.',
    bytes: JPEG,
    contentType: 'image/jpeg',
  },
  {
    n: 2,
    subject: 'Julius and Ethel Rosenberg',
    shows: 'the couple',
    bytes: JPEG,
    contentType: 'image/jpeg',
  },
];

describe('what the model is shown', () => {
  test('each picture after what it was found for, then the question', () => {
    const content = secondLookContent(CANDIDATES);
    expect(content.map((block) => block.type)).toEqual([
      'text',
      'image',
      'text',
      'image',
      'text',
    ]);
    expect(content[0]!.text).toBe(
      'Picture 1. Subject: First dust storms. The slide says: Ten years that changed America. 1932: First dust storms.'
    );
    expect(content[2]!.text).toBe(
      'Picture 2. Subject: Julius and Ethel Rosenberg. It should show: the couple.'
    );
    expect(content[1]).toEqual({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: Buffer.from(JPEG).toString('base64'),
      },
    });
  });
});

describe('reading the verdicts', () => {
  test('the JSON in the answer; nothing readable is no verdict at all', () => {
    const verdicts = readSecondLookAnswer(
      '{"pictures": [{"n": 1, "keep": false, "why": "a 1932 film poster"}, {"n": 2, "keep": true, "alt": "Julius and Ethel Rosenberg behind a wire screen."}]}'
    );
    expect(verdicts?.get(1)).toEqual({
      keep: false,
      why: 'a 1932 film poster',
    });
    expect(verdicts?.get(2)).toEqual({
      keep: true,
      alt: 'Julius and Ethel Rosenberg behind a wire screen.',
    });
    expect(readSecondLookAnswer('Looks fine to me.')).toBeNull();
    expect(readSecondLookAnswer('{"pictures": [{"n": "one"}]}')).toBeNull();
  });
});

describe('secondLook', () => {
  test('a picture the answer says nothing about passed the rules, and is kept', async () => {
    const verdicts = await secondLook(
      CANDIDATES,
      async () =>
        '{"pictures": [{"n": 1, "keep": false, "why": "film poster"}]}'
    );
    expect(verdicts?.get(1)?.keep).toBe(false);
    expect(verdicts?.get(2)).toEqual({ keep: true });
  });

  test('a failed or unreadable look is no look: null, and the caller keeps what the rules kept', async () => {
    expect(
      await secondLook(CANDIDATES, async () =>
        Promise.reject(new Error('timeout'))
      )
    ).toBeNull();
    expect(await secondLook(CANDIDATES, async () => 'sorry')).toBeNull();
  });

  test('nothing to look at asks nothing', async () => {
    let asked = false;
    const verdicts = await secondLook([], async () => {
      asked = true;
      return '';
    });
    expect(asked).toBe(false);
    expect(verdicts?.size).toBe(0);
  });
});
