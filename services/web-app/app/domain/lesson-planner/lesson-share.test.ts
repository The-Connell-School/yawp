import { describe, expect, test } from 'bun:test';
import {
  AUDIENCE_SETUP,
  classroomShareUrl,
  fallbackLessonText,
  parseShareItems,
  teamsShareUrl,
} from './lesson-share';

describe('Post to your class and Send this lesson (stack page redesign)', () => {
  test('each tab changes the recipient, what they get, the note and the button', () => {
    expect(AUDIENCE_SETUP.sub).toMatchObject({
      tab: 'Substitute',
      recipientLabel: 'Substitute’s email',
      noteLabel: 'Special instructions for your sub',
      button: 'Send sub plan',
    });
    expect(AUDIENCE_SETUP.sub.items.map((item) => [item.label, item.checked])).toEqual([
      ['Sub-ready lesson plan', true],
      ['Handouts to print', true],
      ['Slide deck link', true],
      ['Class roster', false],
    ]);
    expect(AUDIENCE_SETUP.family.button).toBe('Send to family');
  });

  test('only known items are kept', () => {
    expect(parseShareItems('deck,handouts,evil,deck')).toEqual(['deck', 'handouts']);
  });

  test('Classroom and Teams share links carry the lesson link', () => {
    expect(classroomShareUrl('https://yawp.school/l/abc', 'Day One')).toBe(
      'https://classroom.google.com/share?url=https%3A%2F%2Fyawp.school%2Fl%2Fabc&title=Day+One'
    );
    expect(teamsShareUrl('https://yawp.school/l/abc', 'Day One')).toContain('href=https%3A%2F%2Fyawp.school%2Fl%2Fabc');
  });

  test('without a rewrite, the page is the steps with their times', () => {
    expect(fallbackLessonText([{ title: 'Hook', minutes: 15, startsAt: 5, excerpt: 'Bags out.' }])).toBe(
      '## Minute 5 · Hook (15 min)\n\nBags out.'
    );
  });
});
