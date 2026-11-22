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

describe('what the model is told', () => {
  test('the rules from the live runs are in its instructions', async () => {
    const { SECOND_LOOK_SYSTEM } = await import('./picture-check.server');
    expect(SECOND_LOOK_SYSTEM).toContain(
      'never keep a book cover, a film still, a poster or an illustration for a fictional character'
    );
    expect(SECOND_LOOK_SYSTEM).toContain(
      'Never keep a photograph of an atrocity'
    );
    // Grapes confirmation run: a good Dust Bowl photograph turned down for not matching "should show" word for word.
    expect(SECOND_LOOK_SYSTEM).toContain('is a preference, not a test');
  });
});

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
    // A sentence first and a note after; a number as text; yes for true; a long alt cut, not refused.
    const loose = readSecondLookAnswer(
      `Here you go:\n{"pictures": [{"n": "1", "keep": "yes", "alt": "${'word '.repeat(100)}"}]}\nNote: {none}`
    );
    expect(loose?.get(1)?.keep).toBe(true);
    expect(loose?.get(1)?.alt?.length).toBeLessThanOrEqual(300);
    expect(readSecondLookAnswer('Looks fine to me.')).toBeNull();
    expect(readSecondLookAnswer('{"pictures": [{"n": "one"}]}')).toBeNull();
  });
});

describe('secondLook', () => {
  test('a picture the answer says nothing about was not looked at: no verdict, counted unchecked', async () => {
    const { verdicts, unchecked } = await secondLook(
      CANDIDATES,
      async () =>
        '{"pictures": [{"n": 1, "keep": false, "why": "film poster"}]}'
    );
    expect(verdicts.get(1)?.keep).toBe(false);
    expect(verdicts.has(2)).toBe(false);
    expect(unchecked).toBe(1);
  });

  test('a failed or unreadable look gives no verdicts, and nothing is kept on its word (Night, Nov 22)', async () => {
    for (const look of [
      async () => Promise.reject(new Error('timeout')),
      async () => 'sorry',
    ]) {
      const { verdicts, unchecked } = await secondLook(CANDIDATES, look);
      expect(verdicts.size).toBe(0);
      expect(unchecked).toBe(2);
    }
  });

  test('pictures go four at a time, side by side; a batch that fails costs only its own', async () => {
    const many: LookCandidate[] = Array.from({ length: 9 }, (_, i) => ({
      n: i + 1,
      subject: `S${i + 1}`,
      bytes: JPEG,
      contentType: 'image/jpeg',
    }));
    const sizes: number[] = [];
    const { verdicts, unchecked } = await secondLook(
      many,
      async (_system, content) => {
        const ns = content.flatMap((block) =>
          typeof block.text === 'string' && /^Picture (\d+)/.test(block.text)
            ? [Number(/^Picture (\d+)/.exec(block.text)![1])]
            : []
        );
        sizes.push(ns.length);
        if (ns.includes(5)) throw new Error('timeout');
        return JSON.stringify({
          pictures: ns.map((n) => ({ n, keep: true, alt: `Picture ${n}.` })),
        });
      }
    );
    expect(sizes.sort()).toEqual([1, 4, 4]);
    expect([...verdicts.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 9]);
    expect(unchecked).toBe(4);
  });

  test('a verdict for a picture it was not shown is ignored', async () => {
    const { verdicts } = await secondLook(
      CANDIDATES.slice(0, 1),
      async () =>
        '{"pictures": [{"n": 1, "keep": true}, {"n": 7, "keep": true}]}'
    );
    expect([...verdicts.keys()]).toEqual([1]);
  });

  test('nothing to look at asks nothing', async () => {
    let asked = false;
    const { verdicts } = await secondLook([], async () => {
      asked = true;
      return '';
    });
    expect(asked).toBe(false);
    expect(verdicts.size).toBe(0);
  });
});
