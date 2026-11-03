import { describe, expect, test } from 'bun:test';
import {
  courseBlocks,
  courseNameFor,
  courseNames,
  insertLine,
  insertOptions,
  lessonCountLine,
  matchCourse,
  unitKind,
  UNIT_KIND_LABELS,
  writingShare,
} from './library-v2';

describe('library v2 rules (Oct 24 handoff, Part 2)', () => {
  test('kinds: six, texts unless set', () => {
    expect(Object.keys(UNIT_KIND_LABELS)).toEqual(['book', 'texts', 'poetry', 'writing', 'language', 'skills']);
    expect(UNIT_KIND_LABELS.texts).toBe('Short texts');
    expect(unitKind(null)).toBe('texts');
    expect(unitKind('poetry')).toBe('poetry');
    expect(unitKind('nonsense')).toBe('texts');
  });

  test("courses: one per class name, without the period; 'My lessons' with none", () => {
    expect(courseNameFor({ title: 'English 10 · Period 3', grade: null })).toBe('English 10');
    expect(courseNameFor({ title: 'American Literature (P5)', grade: null })).toBe('American Literature');
    expect(courseNameFor({ title: null, grade: '11' })).toBe('Grade 11');
    expect(courseNameFor({ title: null, grade: '9th' })).toBe('9th grade');
    expect(courseNameFor({ title: null, grade: 'Freshman' })).toBe('Freshman');
    expect(courseNameFor({ title: null, grade: null })).toBeNull();
    expect(
      courseNames([
        { title: 'English 10 · Period 3', grade: null },
        { title: 'english 10 - Period 5', grade: null },
        { title: 'American Literature', grade: null },
      ])
    ).toEqual(['English 10', 'American Literature']);
    expect(courseNames([])).toEqual(['My lessons']);
  });

  test("a unit goes to its lessons' class's course, or the first", () => {
    const courses = [
      { id: 'c1', name: 'English 10' },
      { id: 'c2', name: 'American Literature' },
    ];
    expect(matchCourse(courses, ['American Literature · Period 2'])).toBe('c2');
    expect(matchCourse(courses, [null, 'Biology'])).toBe('c1');
  });

  test('tile line: lessons and drafts', () => {
    expect(lessonCountLine([])).toBe('No lessons yet');
    expect(lessonCountLine([{ set: true }])).toBe('1 lesson');
    expect(lessonCountLine([{ set: true }, { set: false }, { set: true }])).toBe('3 lessons · 1 draft');
    expect(lessonCountLine([{ set: false }, { set: false }])).toBe('2 lessons · 2 drafts');
  });

  test('writing share: every day added up, over the period or the plan when longer', () => {
    expect(
      writingShare([
        { minutes: 50, period: 50, writingMinutes: 20 },
        { minutes: 60, period: 50, writingMinutes: 30 },
      ])
    ).toEqual({ minutes: 50, percent: 45 });
    expect(writingShare([])).toEqual({ minutes: 0, percent: 0 });
  });

  test('the sequence: groups and units on their own, in order; units in a group by position', () => {
    const blocks = courseBlocks(
      [
        { id: 'g1', title: 'Romanticism', subtitle: '1830–1865', position: 1 },
        { id: 'g2', title: 'Empty', subtitle: null, position: 3 },
      ],
      [
        { id: 'u3', groupId: 'g1', position: 2 },
        { id: 'u1', groupId: null, position: 0 },
        { id: 'u2', groupId: 'g1', position: 1 },
        { id: 'u4', groupId: null, position: 2 },
      ]
    );
    expect(blocks.map((block) => (block.kind === 'group' ? `${block.group.id}:${block.units.map((unit) => unit.id).join(',')}` : block.unit.id))).toEqual([
      'u1',
      'g1:u2,u3',
      'u4',
      'g2:',
    ]);
  });

  test('insert anywhere: the choices, and what it becomes', () => {
    const days = [{ title: 'Opening' }, { title: 'Chapter 1' }, { title: 'Chapter 2' }];
    expect(insertOptions(days)).toEqual([
      { index: 0, label: 'At the start' },
      { index: 1, label: 'After Day 1 · Opening' },
      { index: 2, label: 'After Day 2 · Chapter 1' },
      { index: 3, label: 'At the end as Day 4' },
    ]);
    expect(insertLine(3, 4)).toBe('It becomes Day 4. Day 4 and the days after it move down one.');
    expect(insertLine(3, 3)).toBe('It becomes Day 4.');
    expect(insertLine(0, 0)).toBe('It becomes Day 1.');
  });
});
