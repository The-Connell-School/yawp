import { describe, expect, test } from 'bun:test';
import { loungeByline, loungeDisplayName } from './display-name';

describe('loungeDisplayName', () => {
  test('first name and last initial by default', () => {
    expect(loungeDisplayName('Maria Santos', 'FIRST_NAME_LAST_INITIAL')).toBe('Maria S.');
  });

  test('uses the last word for the initial when there is a middle name', () => {
    expect(loungeDisplayName('Mary Ann de la Cruz', 'FIRST_NAME_LAST_INITIAL')).toBe('Mary C.');
  });

  test('full name keeps the whole trimmed name', () => {
    expect(loungeDisplayName('  Kevin   Gregorio ', 'FULL_NAME')).toBe('Kevin Gregorio');
  });

  test('first name only drops the rest', () => {
    expect(loungeDisplayName('Kevin Gregorio', 'FIRST_NAME_ONLY')).toBe('Kevin');
  });

  test('a one-word name stays as is in every style', () => {
    expect(loungeDisplayName('Prince', 'FIRST_NAME_LAST_INITIAL')).toBe('Prince');
    expect(loungeDisplayName('Prince', 'FULL_NAME')).toBe('Prince');
  });

  test('a missing name reads as "A teacher"', () => {
    expect(loungeDisplayName(null, 'FULL_NAME')).toBe('A teacher');
    expect(loungeDisplayName('   ', 'FIRST_NAME_ONLY')).toBe('A teacher');
  });
});

describe('loungeByline', () => {
  test('shows the school unless the teacher chose first name only', () => {
    expect(
      loungeByline({ name: 'Maria Santos', style: 'FIRST_NAME_LAST_INITIAL', schoolName: 'Cristo Rey', isStaff: false })
    ).toEqual({ name: 'Maria S.', detail: 'Cristo Rey' });
    expect(
      loungeByline({ name: 'Maria Santos', style: 'FIRST_NAME_ONLY', schoolName: 'Cristo Rey', isStaff: false })
    ).toEqual({ name: 'Maria', detail: null });
  });

  test('a teacher with no profile yet reads as first name and last initial', () => {
    expect(
      loungeByline({ name: 'Maria Santos', style: null, schoolName: null, isStaff: false })
    ).toEqual({ name: 'Maria S.', detail: null });
  });

  test('the Yawp team always shows full name and "Yawp team"', () => {
    expect(
      loungeByline({ name: 'Brian Connell', style: 'FIRST_NAME_ONLY', schoolName: 'The Connell School', isStaff: true })
    ).toEqual({ name: 'Brian Connell', detail: 'Yawp team' });
  });
});
