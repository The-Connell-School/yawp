import { describe, expect, test } from 'bun:test';
import { overLead, readExtensionIds, splitExtensions, suggestedExtension } from './extensions';
import type { TimedBlock } from './stack-timing';

function block(id: string, overrides: Partial<TimedBlock>): TimedBlock {
  return {
    id,
    title: id,
    type: 'activity',
    minutes: 10,
    isWriting: false,
    startsAt: 0,
    suggested: false,
    ...overrides,
  } as TimedBlock;
}

describe("extensions (Kevin's notes 8b, 8c)", () => {
  test('reads only ids from the stored column', () => {
    expect(readExtensionIds(['a', 3, '', 'b'])).toEqual(['a', 'b']);
    expect(readExtensionIds(null)).toEqual([]);
    expect(readExtensionIds({ a: 1 })).toEqual([]);
  });

  test('splits the timed steps from the extensions, keeping the extensions in the order set aside', () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(splitExtensions(steps, ['c', 'a', 'gone'])).toEqual({ steps: [{ id: 'b' }], extensions: [{ id: 'c' }, { id: 'a' }] });
  });

  test('suggests writing first, the smallest that brings it back on time', () => {
    const blocks = [
      block('starter', { type: 'class_starter', isWriting: true, minutes: 5 }),
      block('Reading on', { type: 'read_aloud', minutes: 15 }),
      block('Long write', { type: 'daily_pages', isWriting: true, minutes: 20 }),
      block('Short write', { type: 'activity', isWriting: true, minutes: 12 }),
      block('Exit ticket', { type: 'closing', isWriting: true, minutes: 5 }),
    ];
    expect(suggestedExtension(blocks, 10)?.id).toBe('Short write');
    expect(suggestedExtension(blocks, 15)?.id).toBe('Long write');
    expect(suggestedExtension(blocks, 30)?.id).toBe('Long write');
  });

  test('then reading on, then discussion; never the opener or the closing', () => {
    expect(
      suggestedExtension(
        [block('Discussion first', { minutes: 10 }), block('Pair discussion', { minutes: 10 }), block('Read on', { type: 'read_aloud' })],
        5
      )?.id
    ).toBe('Read on');
    expect(suggestedExtension([block('open', {}), block('Socratic seminar', {})], 5)?.id).toBe('Socratic seminar');
    expect(suggestedExtension([block('open', {}), block('Lecture', { type: 'context' })], 5)).toBeNull();
  });

  test('nothing to suggest when it fits', () => {
    expect(suggestedExtension([block('a', {}), block('b', { isWriting: true })], 0)).toBeNull();
  });

  test('the lead line names the minutes and the period', () => {
    expect(overLead(15, 60)).toBe("You've added some great pieces, but this runs 15 minutes over your 60.");
    expect(overLead(1, null)).toBe("You've added some great pieces, but this runs 1 minute over.");
  });
});
