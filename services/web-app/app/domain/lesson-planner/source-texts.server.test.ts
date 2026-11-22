/**
 * The source texts quotations are checked against (Nov 22, lesson review
 * pattern 2): the registry, the work a lesson is about, and the Gutenberg
 * text fetched, stripped and kept.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SOURCE_TEXT_WORKS,
  clearSourceTextCache,
  fetchWorkText,
  gutenbergTextUrl,
  registeredWork,
  stripGutenberg,
  workForText,
} from './source-texts.server';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, 'fixtures', 'accuracy', name), 'utf8');

const OWEN = fixture('source-owen-poems.txt');

describe('the registry', () => {
  test('holds the works high school English teaches most, each once', () => {
    const ids = SOURCE_TEXT_WORKS.map((work) => work.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      'macbeth',
      'hamlet',
      'romeo-and-juliet',
      'othello',
      'julius-caesar',
      'midsummer',
      'king-lear',
      'the-tempest',
      'odyssey',
      'iliad',
      'frankenstein',
      'great-gatsby',
      'wilfred-owen',
      'scarlet-letter',
      'pride-and-prejudice',
      'jane-eyre',
      'huckleberry-finn',
      'the-raven',
      'dickinson',
      'whitman',
      'frost-north-of-boston',
      'heart-of-darkness',
      'christmas-carol',
      'dracula',
      'dorian-gray',
    ])
      expect(registeredWork(id)).not.toBeNull();
    const numbers = SOURCE_TEXT_WORKS.map((work) => work.gutenbergId);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  test('translations, and Dickinson’s altered first editions, are checked but never corrected against', () => {
    expect(registeredWork('odyssey')?.verifyOnly).toBe(true);
    expect(registeredWork('odyssey')?.edition).toContain('Butler');
    expect(registeredWork('odyssey')?.note).toContain('Fagles');
    expect(registeredWork('iliad')?.verifyOnly).toBe(true);
    expect(registeredWork('dickinson')?.verifyOnly).toBe(true);
    expect(registeredWork('macbeth')?.verifyOnly).toBeUndefined();
  });

  test('a Gutenberg plain-text address', () => {
    expect(gutenbergTextUrl(1533)).toBe(
      'https://www.gutenberg.org/cache/epub/1533/pg1533.txt'
    );
  });
});

describe('the work a lesson is about', () => {
  test('read off the real replies', () => {
    expect(workForText(fixture('reply-dulce.md'))?.id).toBe('wilfred-owen');
    expect(workForText(fixture('reply-gatsby-1.md'))?.id).toBe('great-gatsby');
    expect(workForText(fixture('reply-macbeth-1.md'))?.id).toBe('macbeth');
    expect(workForText(fixture('reply-macbeth-2.md'))?.id).toBe('macbeth');
    expect(workForText(fixture('reply-odyssey-1.md'))?.id).toBe('odyssey');
  });

  test('a work not registered is not mistaken for one it mentions', () => {
    expect(workForText(fixture('reply-their-eyes-1.md'))).toBeNull();
    expect(
      workForText('A lesson on 1984. Winston, like Macbeth, is undone.')
    ).toBeNull();
    expect(workForText('')).toBeNull();
  });

  test('a name in the heading is enough; a common word as a word is not a title', () => {
    expect(workForText('# Hamlet, Act 3: the soliloquy\nRead it.')?.id).toBe(
      'hamlet'
    );
    expect(
      workForText('# Close reading\nThe futility of birches and mowing.')
    ).toBeNull();
    expect(workForText('# Reading "The Road Not Taken"')?.id).toBe(
      'frost-mountain-interval'
    );
  });
});

describe('the text', () => {
  beforeEach(() => clearSourceTextCache());

  test('Gutenberg’s header and footer are taken off', () => {
    const text = stripGutenberg(OWEN);
    expect(text.startsWith('POEMS')).toBe(true);
    expect(text).not.toContain('PROJECT GUTENBERG');
    expect(text).toContain('Pro patria mori_.');
  });

  test('fetched once, from Gutenberg, and kept', async () => {
    const asked: string[] = [];
    const fetch = async (url: string) => {
      asked.push(url);
      return new Response(OWEN);
    };
    const work = registeredWork('wilfred-owen')!;
    const text = await fetchWorkText(work, { fetch });
    expect(text).toContain('My friend, you would not tell with such high zest');
    expect(await fetchWorkText(work, { fetch })).toBe(text);
    expect(asked).toEqual([gutenbergTextUrl(work.gutenbergId)]);
  });

  test('a text that is not the work (a wrong ebook number) is no text', async () => {
    const fetch = async () => new Response(OWEN);
    expect(
      await fetchWorkText(registeredWork('macbeth')!, { fetch })
    ).toBeNull();
  });

  test('no answer, a refusal or a timeout gives null, and is asked again next time', async () => {
    const work = registeredWork('wilfred-owen')!;
    let calls = 0;
    const failing = async () => {
      calls += 1;
      throw new Error('offline');
    };
    expect(await fetchWorkText(work, { fetch: failing })).toBeNull();
    expect(
      await fetchWorkText(work, {
        fetch: async () => new Response('Not found', { status: 404 }),
      })
    ).toBeNull();
    const slow = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('aborted'))
        )
      );
    expect(
      await fetchWorkText(work, { fetch: slow, timeoutMs: 20 })
    ).toBeNull();
    expect(
      await fetchWorkText(work, { fetch: async () => new Response(OWEN) })
    ).toContain('Bent double');
    expect(calls).toBe(1);
  });
});
