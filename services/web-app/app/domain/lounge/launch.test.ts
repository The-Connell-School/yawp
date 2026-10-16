import { describe, expect, test } from 'bun:test';
import {
  LOUNGE_HOUSE_RULES,
  LOUNGE_NAME,
  LOUNGE_TEAM_NAME,
  hasPlaceholderText,
  parseContactMessage,
  parseLoungeSchedule,
} from './launch';

describe('names', () => {
  test('the community is the Faculty Lounge, run by the YAWP! team', () => {
    expect(LOUNGE_NAME).toBe('Faculty Lounge');
    expect(LOUNGE_TEAM_NAME).toBe('YAWP! team');
  });
});

describe('house rules', () => {
  test("are Brian's seven, in his order", () => {
    expect(LOUNGE_HOUSE_RULES.map((rule) => rule.title)).toEqual([
      'Protect your students.',
      'Ask the question.',
      'Think out loud.',
      'Give each other grace.',
      'Vent if you need to, but lean toward solutions.',
      'Keep it about teaching.',
      'Something broken or wrong?',
    ]);
    expect(LOUNGE_HOUSE_RULES[0].detail).toBe('No names, photos, or details that could identify a student.');
    expect(LOUNGE_HOUSE_RULES[6].detail).toContain('Contact Us');
  });
});

describe('parseLoungeSchedule', () => {
  const now = new Date('2026-10-16T15:00:00Z');

  test('posts now by default', () => {
    expect(parseLoungeSchedule({}, now)).toEqual({ ok: true, value: { draft: false, publishAt: null } });
    expect(parseLoungeSchedule({ publishMode: 'now' }, now)).toEqual({ ok: true, value: { draft: false, publishAt: null } });
  });

  test('saves a draft', () => {
    expect(parseLoungeSchedule({ publishMode: 'draft' }, now)).toEqual({ ok: true, value: { draft: true, publishAt: null } });
  });

  test('schedules for a future time', () => {
    expect(parseLoungeSchedule({ publishMode: 'schedule', publishAt: '2026-10-23T14:00:00.000Z' }, now)).toEqual({
      ok: true,
      value: { draft: false, publishAt: new Date('2026-10-23T14:00:00.000Z') },
    });
  });

  test('refuses a missing or past schedule time', () => {
    expect(parseLoungeSchedule({ publishMode: 'schedule', publishAt: '' }, now).ok).toBe(false);
    expect(parseLoungeSchedule({ publishMode: 'schedule', publishAt: '2026-10-01T00:00:00Z' }, now).ok).toBe(false);
    expect(parseLoungeSchedule({ publishMode: 'schedule', publishAt: 'next tuesday' }, now).ok).toBe(false);
  });
});

describe('parseContactMessage', () => {
  test('trims and accepts a message', () => {
    expect(parseContactMessage({ message: '  The grade did not release.  ', pageUrl: '/app/lounge' })).toEqual({
      ok: true,
      value: { message: 'The grade did not release.', pageUrl: '/app/lounge' },
    });
  });

  test('requires a message and caps its length', () => {
    expect(parseContactMessage({ message: ' ' }).ok).toBe(false);
    expect(parseContactMessage({ message: 'x'.repeat(4001) }).ok).toBe(false);
  });

  test('keeps only an in-app page path', () => {
    expect(parseContactMessage({ message: 'Hi', pageUrl: 'https://evil.example/x' })).toEqual({
      ok: true,
      value: { message: 'Hi', pageUrl: null },
    });
  });
});

describe('hasPlaceholderText', () => {
  test("spots Brian's [bracketed notes] still waiting to be filled in", () => {
    expect(hasPlaceholderText("Brian's first post: [a line or short passage from a student]")).toBe(true);
    expect(hasPlaceholderText('Read the [Daily Pages module](link) too')).toBe(false);
    expect(hasPlaceholderText('Plain text, no brackets.')).toBe(false);
  });
});
