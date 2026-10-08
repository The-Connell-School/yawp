import { describe, expect, test } from 'bun:test';
import { replyWorthKeeping, splitReplyParts } from './reply-parts';

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
    const [part] = splitReplyParts('```yawp-exit-ticket\nmode: basic\n```');

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

describe('replyWorthKeeping', () => {
  const keepable = (content: string, extra = {}) =>
    replyWorthKeeping(splitReplyParts(content), extra);

  test('an intake question is not something to file in a lesson', () => {
    // "Add all of this" under "Where are they in the book?" offers to print a
    // question as a page of the lesson.
    expect(
      keepable(
        'Where are they in the book? I will pull the quotes from what they have read.'
      )
    ).toBe(false);
    expect(
      keepable(
        "Chapter 3 works well for this: Candy's dog gives them a scene with a lot underneath it.\n\nHow long is the period, and how do you want them working?"
      )
    ).toBe(false);
  });

  test('a plan with headings is', () => {
    expect(keepable('## Warm-up (5 min)\n\nDaily Pages prompt FW-001.')).toBe(
      true
    );
  });

  test('a schedule laid out as a table is', () => {
    expect(
      keepable(
        'Here is the timing.\n\n| Minutes | What happens |\n| --- | --- |\n| 5 | Starter |'
      )
    ).toBe(true);
  });

  test('anything that hands over material is, however short its prose', () => {
    expect(
      keepable(
        '```yawp-material\nkind: handout\ntitle: Diagnose & Repair\n---\nFix each sentence.\n```'
      )
    ).toBe(true);
    expect(
      keepable(
        'Pick one:\n\n```yawp-daily-pages\nkind: class-starter\nWrite about a door.\n```'
      )
    ).toBe(true);
  });

  test('a deck or a unit map is, even though neither is a reply part', () => {
    expect(keepable('Here is the deck.', { hasDeck: true })).toBe(true);
    expect(keepable('Here is the map.', { hasUnit: true })).toBe(true);
  });

  test('long advice without headings is still worth keeping', () => {
    const advice = Array.from(
      { length: 8 },
      () =>
        'Give every student thirty seconds of silent writing before anyone speaks, then call on prepared thinking.'
    ).join(' ');
    expect(keepable(advice)).toBe(true);
  });
});
