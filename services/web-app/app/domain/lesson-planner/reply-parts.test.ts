import { describe, expect, test } from 'bun:test';
import { splitReplyParts } from './reply-parts';

describe('splitReplyParts', () => {
  test('keeps a lesson in the order it was written', () => {
    // The warm-up belongs at the warm-up and the check belongs at the close.
    // Lifting either into a pile below the plan puts the button inches away
    // from the step it belongs to.
    const parts = splitReplyParts(
      [
        '## Warm-up (5 min)',
        '```yawp-daily-pages\nWrite about a decision you changed your mind about.\n```',
        '## Mini-lesson (15 min)',
        '```yawp-material\nkind: handout\ntitle: Diagnose & Repair\n---\nFix each sentence.\n```',
        '## Closing (4 min)',
        '```yawp-exit-ticket\nmode: specific\nfocus: explain-concept\ntopic: weathering and erosion\nanswer: objective\n```',
      ].join('\n\n')
    );

    expect(parts.map((part) => part.kind)).toEqual([
      'markdown',
      'daily-pages',
      'markdown',
      'material',
      'markdown',
      'exit-ticket',
    ]);
  });

  test('keeps assigned writing practice at the step that uses it', () => {
    const parts = splitReplyParts(
      [
        '## Mini-lesson (10 min)',
        '```yawp-practice\nlessons: fixing-comma-splices\nproblems: 6\n```',
        '## Closing',
      ].join('\n\n')
    );

    expect(parts.map((part) => part.kind)).toEqual([
      'markdown',
      'practice',
      'markdown',
    ]);
    const practice = parts[1]!;
    if (practice.kind !== 'practice') throw new Error('wrong part');
    expect(practice.practice.lessonSlugs).toEqual(['fixing-comma-splices']);
    expect(practice.practice.problemCount).toBe(6);
  });

  test('composes the ticket rather than carrying the block through', () => {
    const [part] = splitReplyParts(
      '```yawp-exit-ticket\nmode: basic\n```'
    );

    expect(part!.kind).toBe('exit-ticket');
    if (part!.kind !== 'exit-ticket') throw new Error('wrong part');
    expect(part.ticket.config.mode).toBe('basic');
    expect(part.ticket.prompt).toContain('what you learned today');
  });

  test('a ticket it cannot build produces nothing and shifts nothing', () => {
    // Material keys are positions among the materials that parsed, so a
    // dropped block must not renumber the ones after it.
    const parts = splitReplyParts(
      [
        '```yawp-exit-ticket\nmode: specific\nfocus: explain-concept\n```',
        '```yawp-material\nkind: handout\ntitle: Practice set\n---\nTen items.\n```',
      ].join('\n\n')
    );

    expect(parts).toHaveLength(1);
    expect(parts[0]!.kind).toBe('material');
    if (parts[0]!.kind !== 'material') throw new Error('wrong part');
    expect(parts[0]!.material.key).toBe('0');
  });
});
