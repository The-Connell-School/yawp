import { describe, expect, test } from 'bun:test';
import {
  isExternalTeachLink,
  normalizeTeachLink,
  showHowToTeachIt,
} from './how-to-teach-it';

describe('normalizeTeachLink', () => {
  test('keeps https and http links, trimmed', () => {
    expect(normalizeTeachLink('  https://youtu.be/abc ')).toBe(
      'https://youtu.be/abc'
    );
    expect(normalizeTeachLink('http://example.com/x')).toBe(
      'http://example.com/x'
    );
  });

  test('keeps in-app paths', () => {
    expect(normalizeTeachLink('/app/lesson-planner/library')).toBe(
      '/app/lesson-planner/library'
    );
  });

  test('drops blanks', () => {
    expect(normalizeTeachLink('')).toBeNull();
    expect(normalizeTeachLink('   ')).toBeNull();
    expect(normalizeTeachLink(null)).toBeNull();
    expect(normalizeTeachLink(undefined)).toBeNull();
  });

  test('drops anything a link should not run or leave through', () => {
    expect(normalizeTeachLink('javascript:alert(1)')).toBeNull();
    expect(normalizeTeachLink('data:text/html,hi')).toBeNull();
    expect(normalizeTeachLink('//evil.example.com')).toBeNull();
    expect(normalizeTeachLink('example.com/no-scheme')).toBeNull();
  });
});

describe('isExternalTeachLink', () => {
  test('absolute links open elsewhere; in-app paths do not', () => {
    expect(isExternalTeachLink('https://youtu.be/abc')).toBe(true);
    expect(isExternalTeachLink('/app/lesson-planner/library')).toBe(false);
  });
});

describe('showHowToTeachIt', () => {
  test('teachers with the flag on get How to Teach It', () => {
    expect(
      showHowToTeachIt({ isTeacher: true, flagEnabled: true, modulesVisible: true })
    ).toBe(true);
  });

  test('students never do: they keep the plain Modules list', () => {
    expect(
      showHowToTeachIt({ isTeacher: false, flagEnabled: true, modulesVisible: true })
    ).toBe(false);
  });

  test('flag off keeps the old Modules list', () => {
    expect(
      showHowToTeachIt({ isTeacher: true, flagEnabled: false, modulesVisible: true })
    ).toBe(false);
  });

  test('a page that hides its modules hides How to Teach It too', () => {
    // Exit Ticket and Daily Pages: the modules there are not teaching steps.
    expect(
      showHowToTeachIt({ isTeacher: true, flagEnabled: true, modulesVisible: false })
    ).toBe(false);
  });
});
