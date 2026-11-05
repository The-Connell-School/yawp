import { describe, expect, test } from 'bun:test';
import { findPrivacyConcerns } from './privacy-nudge';

describe('findPrivacyConcerns', () => {
  test('nothing to flag in an ordinary teaching question', () => {
    expect(findPrivacyConcerns('How are you pacing Daily Pages in a 45-minute period?')).toEqual([]);
  });

  test('flags an email address', () => {
    expect(findPrivacyConcerns('Reach the parent at jane.doe@example.com')).toEqual(['email']);
  });

  test('flags a phone number', () => {
    expect(findPrivacyConcerns('call 312-555-0199 after school')).toEqual(['phone']);
  });

  test('flags a named student', () => {
    expect(findPrivacyConcerns('My student Jake rushes every conclusion')).toEqual(['student-name']);
    expect(findPrivacyConcerns('a student named Priya asked me')).toEqual(['student-name']);
  });

  test('does not flag "student" followed by an ordinary word', () => {
    expect(findPrivacyConcerns('My students love it. The student work improved.')).toEqual([]);
  });

  test('lists each kind once', () => {
    expect(
      findPrivacyConcerns('a@b.co and c@d.co, my student Jake and student Ana')
    ).toEqual(['email', 'student-name']);
  });
});
