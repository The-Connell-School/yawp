import { describe, expect, test } from 'bun:test';
import { studentExitTicket } from './student-exit-ticket';

describe('studentExitTicket', () => {
  test.each([
    '**Answer key:** Weathering breaks rocks down.',
    '### Answer-key\nWeathering breaks rocks down.',
    '__What to look for when you sort them:__\nLook for movement.',
    'Sorting notes: Put these in three piles.',
    '## Teacher notes\nCollect these as students leave.',
    '**What to do with each pile:** Reteach tomorrow.',
    '```yawp-material\nkind: answer-key\ntitle: Key\n---\nThe correct answer.\n```',
  ])('removes a trailing teacher section: %s', (notes) => {
    expect(studentExitTicket(`**Prompt:** Explain **weathering** in your own words.\n\n${notes}`))
      .toBe('Explain weathering in your own words.');
  });

  test('preserves multiple student directions and questions, without markdown', () => {
    expect(studentExitTicket('## Exit ticket\n\nWrite *two sentences*.\n1. What is weathering?\n2. What is erosion?'))
      .toBe('Write two sentences.\nWhat is weathering?\nWhat is erosion?');
  });

  test('does not mistake a question containing teacher-section words for a section label', () => {
    expect(studentExitTicket('What do you look for when you compare these rocks?'))
      .toBe('What do you look for when you compare these rocks?');
  });

  test('can find a labeled student question after teacher notes', () => {
    expect(studentExitTicket('**Teacher notes:** Collect at the door.\n\n**Question:** What changed?\n\n**Answer key:** It moved.'))
      .toBe('What changed?');
  });

  test('teacher notes alone never become a student prompt', () => {
    expect(studentExitTicket('**Answer key:** It moved.')).toBe('');
  });
});
