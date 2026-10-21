import { describe, expect, test } from 'bun:test';
import {
  adminExtras,
  AUDIENCE_SETUP,
  classroomShareUrl,
  fallbackLessonText,
  parseShareItems,
  REWRITE_SYSTEM,
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

  test('family: what we did and why, and ways to talk about it at dinner', () => {
    expect(AUDIENCE_SETUP.family.items.map((item) => item.label)).toEqual(['What we did and why', 'Talking about it at dinner']);
    expect(REWRITE_SYSTEM.family).toContain('two or three');
    expect(REWRITE_SYSTEM.family).toContain('## Talking about it at dinner');
  });

  test('admin: the plan, writing time, standards only as named, and an invitation to observe', () => {
    expect(AUDIENCE_SETUP.admin.items.map((item) => item.item)).toEqual(['plan', 'writing', 'standards', 'observe']);
    const standards = AUDIENCE_SETUP.admin.items.find((item) => item.item === 'standards')!;
    expect(standards.hint).toBe('The ones you named in the planner');
    expect(REWRITE_SYSTEM.admin).toContain('Never name a standard');
    expect(parseShareItems('observe')).toEqual(['observe']);
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

describe('adminExtras: only what the teacher said', () => {
  test('the named standards, and the invitation with the class and day', () => {
    const text = adminExtras({
      standards: ['RL.9-10.1'],
      observe: true,
      className: 'English 10 · Period 3',
      lessonDate: '2026-10-27T00:00:00.000Z',
    });
    expect(text).toContain('## Standards');
    expect(text).toContain('- RL.9-10.1');
    expect(text).toContain('with English 10 · Period 3 on Tuesday, October 27');
  });

  test('no standards named: no Standards section at all', () => {
    expect(adminExtras({ standards: [], observe: false, className: null, lessonDate: null })).toBe('');
  });
});
