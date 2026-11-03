import { describe, expect, test } from 'bun:test';
import { groupOptionParts } from './option-groups';
import { splitReplyParts } from './reply-parts';

const starter = (prompt: string) => ['```yawp-daily-pages', 'kind: class-starter', prompt, '```'].join('\n');
const ticket = (question: string) =>
  ['```yawp-exit-ticket', 'mode: basic', `topic: ${question}`, '```'].join('\n');
const notes = (title: string) => ['```yawp-material', 'kind: notes', `title: ${title}`, '---', 'Body.', '```'].join('\n');

describe('groupOptionParts', () => {
  test('three class starters in a row are one set of options', () => {
    const parts = splitReplyParts(['Pick one:', '', starter('One?'), '', starter('Two?'), '', starter('Three?'), '', 'Then read.'].join('\n'));
    const groups = groupOptionParts(parts);
    const options = groups.filter((group) => group.kind === 'options');
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ label: 'Class starter options' });
    expect((options[0] as { indexes: number[] }).indexes).toHaveLength(3);
  });

  test('exit tickets and framing cards group the same way', () => {
    const parts = splitReplyParts([ticket('A?'), ticket('B?'), '', notes('Frame one'), notes('Frame two')].join('\n'));
    const labels = groupOptionParts(parts).flatMap((group) => (group.kind === 'options' ? [group.label] : []));
    expect(labels).toEqual(['Exit ticket options', 'Notes options']);
  });

  test('one card alone, different kinds, or prose between stay separate', () => {
    expect(groupOptionParts(splitReplyParts(starter('Only?'))).every((group) => group.kind === 'single')).toBe(true);
    expect(
      groupOptionParts(splitReplyParts([starter('A?'), ticket('B?')].join('\n'))).every((group) => group.kind === 'single')
    ).toBe(true);
    expect(
      groupOptionParts(splitReplyParts([starter('A?'), 'Or, for a quieter room:', starter('B?')].join('\n'))).every(
        (group) => group.kind === 'single'
      )
    ).toBe(true);
  });

  test('every part is rendered exactly once, in order', () => {
    const parts = splitReplyParts(['Intro', starter('A?'), '', starter('B?'), 'Outro'].join('\n'));
    const seen = groupOptionParts(parts).flatMap((group) => (group.kind === 'single' ? [group.index] : group.indexes));
    const nonBlank = parts.map((part, index) => ({ part, index })).filter(({ part }) => part.kind !== 'markdown' || part.text.trim());
    expect(seen).toEqual(nonBlank.map(({ index }) => index));
  });
});
