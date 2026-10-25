import { describe, expect, test } from 'bun:test';
import { lessonLocation, recentLessonCards, savedAgo, savedLine } from './lesson-location';

// Brian's round 4, item 7: say where a lesson is saved.
describe('lessonLocation', () => {
  test('a lesson in a unit: the course, then the unit, linking to the unit', () => {
    expect(lessonLocation({ id: 'u1', title: 'Age of Reason/Enlightenment', courseName: 'English 10' })).toEqual({
      label: 'English 10 › Age of Reason/Enlightenment',
      href: '/app/lesson-planner/library/unit/u1',
      inUnit: true,
    });
  });

  test('a unit with no course, or the "My lessons" tab, is named on its own', () => {
    expect(lessonLocation({ id: 'u1', title: 'Poetry', courseName: null }).label).toBe('Your library › Poetry');
    expect(lessonLocation({ id: 'u1', title: 'Poetry', courseName: 'My lessons' }).label).toBe('My lessons › Poetry');
  });

  test('a lesson on its own lives under Lessons on their own', () => {
    expect(lessonLocation(null)).toEqual({
      label: 'Your library › Lessons on their own',
      href: '/app/lesson-planner/library',
      inUnit: false,
    });
  });
});

describe('savedAgo', () => {
  const now = new Date('2026-10-25T15:00:00Z');
  test('just now, minutes, hours, then the date', () => {
    expect(savedAgo('2026-10-25T14:59:30Z', now)).toBe('just now');
    expect(savedAgo('2026-10-25T14:58:00Z', now)).toBe('2 min ago');
    expect(savedAgo('2026-10-25T12:00:00Z', now)).toBe('3 hr ago');
    expect(savedAgo('2026-10-23T12:00:00Z', now)).toBe('Oct 23');
  });

  test('a clock running a little ahead still reads just now', () => {
    expect(savedAgo('2026-10-25T15:00:05Z', now)).toBe('just now');
  });
});

describe('savedLine', () => {
  test('"Saved to English 10 › Age of Reason/Enlightenment · 2 min ago"', () => {
    const where = lessonLocation({ id: 'u1', title: 'Age of Reason/Enlightenment', courseName: 'English 10' });
    expect(savedLine(where, '2026-10-25T14:58:00Z', new Date('2026-10-25T15:00:00Z'))).toBe(
      'Saved to English 10 › Age of Reason/Enlightenment · 2 min ago'
    );
  });
});

describe('recentLessonCards: Keep planning', () => {
  test('each lesson with where it is saved, opening its stack (or its chat when empty)', () => {
    const cards = recentLessonCards([
      {
        id: 'l1',
        title: 'chat',
        packetTitle: 'Day 2: Sinners in the Hands of an Angry God (50 min) {type: context}',
        updatedAt: new Date('2026-10-25T14:58:00Z'),
        sectionCount: 6,
        unit: { id: 'u1', title: 'Age of Reason/Enlightenment', courseName: 'English 10' },
      },
      { id: 'l2', title: 'A poem lesson', packetTitle: null, updatedAt: '2026-10-24T10:00:00Z', sectionCount: 0, unit: null },
    ]);
    expect(cards).toEqual([
      {
        id: 'l1',
        title: 'Day 2: Sinners in the Hands of an Angry God',
        href: '/app/lesson-planner/l1/packet',
        where: 'English 10 › Age of Reason/Enlightenment',
        savedAt: '2026-10-25T14:58:00.000Z',
      },
      {
        id: 'l2',
        title: 'A poem lesson',
        href: '/app/lesson-planner?c=l2',
        where: 'Your library › Lessons on their own',
        savedAt: '2026-10-24T10:00:00.000Z',
      },
    ]);
  });
});
