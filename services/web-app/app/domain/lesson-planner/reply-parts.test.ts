import { describe, expect, test } from 'bun:test';
import { splitReplyParts, worthKeeping } from './reply-parts';

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

describe('worthKeeping', () => {
  test('a question back to the teacher is nothing to put in a stack', () => {
    // "Add all as a handout" under "What is the lesson meant to teach?" files
    // a question as a page students hold.
    const body =
      'What is the lesson meant to teach? Paste your plan if you have one.';
    expect(
      worthKeeping({
        parts: splitReplyParts(body),
        hasDeck: false,
        hasUnitMap: false,
      })
    ).toBe(false);
  });

  test('a plan with sections is worth keeping', () => {
    const body = '## Warm-up (5 min)\n\nWrite.\n\n## Closing (5 min)\n\nShare.';
    expect(
      worthKeeping({
        parts: splitReplyParts(body),
        hasDeck: false,
        hasUnitMap: false,
      })
    ).toBe(true);
  });

  test('a reply that hands over a piece is worth keeping, however short the prose', () => {
    const body =
      'Here it is.\n\n```yawp-material\nkind: exit-ticket\ntitle: Quote check\n---\nIntegrate this quote.\n```';
    expect(
      worthKeeping({
        parts: splitReplyParts(body),
        hasDeck: false,
        hasUnitMap: false,
      })
    ).toBe(true);
  });

  test('a deck or a unit map is worth keeping', () => {
    const parts = splitReplyParts('Here is the deck.');
    expect(worthKeeping({ parts, hasDeck: true, hasUnitMap: false })).toBe(
      true
    );
    expect(worthKeeping({ parts, hasDeck: false, hasUnitMap: true })).toBe(
      true
    );
  });

  test('a long answer in prose is still worth keeping', () => {
    // A discussion protocol written as paragraphs is material, headings or not.
    const body = Array.from(
      { length: 8 },
      () =>
        'Pairs talk for two minutes, then each partner reports what the other said.'
    ).join('\n\n');
    expect(
      worthKeeping({
        parts: splitReplyParts(body),
        hasDeck: false,
        hasUnitMap: false,
      })
    ).toBe(true);
  });
});
