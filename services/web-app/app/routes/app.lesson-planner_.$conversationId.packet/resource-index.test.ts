import { describe, expect, test } from 'bun:test';
import { availableFilters, KIND_LABEL } from './resource-index';

describe('availableFilters', () => {
  test('offers only the kinds the lesson actually contains', () => {
    expect(availableFilters([{ kind: 'plan' }, { kind: 'handout' }])).toEqual([
      'all',
      'plan',
      'handout',
    ]);
  });

  test('keeps a stable order regardless of how resources were saved', () => {
    expect(
      availableFilters([
        { kind: 'slides' },
        { kind: 'handout' },
        { kind: 'plan' },
      ])
    ).toEqual(['all', 'plan', 'handout', 'slides']);
  });

  test('does not repeat a kind saved more than once', () => {
    expect(
      availableFilters([{ kind: 'handout' }, { kind: 'handout' }])
    ).toEqual(['all', 'handout']);
  });

  test('is just "all" for an empty lesson, so no filter row renders', () => {
    expect(availableFilters([])).toEqual(['all']);
  });

  test('names every kind for the filter row', () => {
    expect(KIND_LABEL).toMatchObject({
      plan: 'Plan',
      handout: 'Handout',
      slides: 'Slides',
    });
  });
});
