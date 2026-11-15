import { describe, expect, test } from 'bun:test';

import { STEP_TYPE_LABELS, parseStepType, stepTypeFor, writingName } from './step-types';
import { stackSteps } from './stack-steps';

/**
 * Daily Pages is called Short Response now (Brian, Nov 15). The planner says
 * the new name everywhere a teacher reads it, and everything it saved before
 * the rename (titles, prefixes, tags) still reads the way it did.
 */
describe('Short Response in the Lesson Planner', () => {
  test('the step type is labelled Short Response', () => {
    expect(STEP_TYPE_LABELS.daily_pages).toBe('Short Response');
    expect(writingName({ kind: 'daily-pages', stepType: 'activity' })).toBe('Short Response');
    expect(writingName({ kind: 'step', stepType: 'daily_pages' })).toBe('Short Response');
  });

  test('a tag in either name is the same step type', () => {
    expect(parseStepType('daily_pages')).toBe('daily_pages');
    expect(parseStepType('Short Response')).toBe('daily_pages');
    expect(parseStepType('short-response')).toBe('daily_pages');
  });

  test('a title in either name is the same step type', () => {
    for (const title of ['Daily Pages: the island', 'Short Response: the island']) {
      expect(stepTypeFor({ kind: 'step', title })).toBe('daily_pages');
    }
  });

  test('either prefix is dropped from a step title, since the chip says the type', () => {
    for (const prefix of ['Daily Pages', 'Short Response']) {
      const [step] = stackSteps({
        packet: {
          sections: [
            {
              id: 's1',
              anchor: 's1',
              title: `${prefix}: What one item reveals (8 min)`,
              content: 'Write.',
              origin: 'reply',
            },
          ],
          outline: [],
        } as never,
        materialKinds: {},
        materialMeta: {},
        materialTokens: {},
        stackDetails: {},
      });
      expect(step!.title).toBe('What one item reveals');
    }
  });
});
