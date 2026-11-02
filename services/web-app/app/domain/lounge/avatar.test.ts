import { describe, expect, test } from 'bun:test';
import { LOUNGE_AVATAR_TONES, avatarToneFor, firstNameOf, initialsFor, previewFor } from './avatar';

describe('initialsFor', () => {
  test('first and last initials, upper case', () => {
    expect(initialsFor('Brian Connell')).toBe('BC');
    expect(initialsFor('maria de la santos')).toBe('MS');
  });

  test('one name gives one letter; nothing gives a neutral mark', () => {
    expect(initialsFor('Cher')).toBe('C');
    expect(initialsFor('  ')).toBe('?');
    expect(initialsFor(null)).toBe('?');
  });
});

describe('firstNameOf', () => {
  test('the first word, or null', () => {
    expect(firstNameOf('Brian Connell')).toBe('Brian');
    expect(firstNameOf('')).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
});

describe('avatarToneFor', () => {
  test('the same person always gets the same tone, from the fixed set', () => {
    const tone = avatarToneFor('user_abc');
    expect(avatarToneFor('user_abc')).toBe(tone);
    expect(LOUNGE_AVATAR_TONES).toContain(tone);
  });

  test('different people spread across the tones', () => {
    const tones = new Set(Array.from({ length: 60 }, (_, i) => avatarToneFor(`user_${i}`)));
    expect(tones.size).toBeGreaterThan(3);
  });
});

describe('previewFor', () => {
  test("the YAWP! team's answer comes first, so all-title questions show Brian's answer", () => {
    expect(previewFor({ body: '', staffReplyBody: 'Use the Class Starter to build reps.' })).toBe(
      'Use the Class Starter to build reps.'
    );
    expect(previewFor({ body: 'My students stop.', staffReplyBody: 'Keep the timer visible.' })).toBe(
      'Keep the timer visible.'
    );
  });

  test('else the post body, else nothing', () => {
    expect(previewFor({ body: 'She came in at lunch to rewrite it.', staffReplyBody: null })).toBe(
      'She came in at lunch to rewrite it.'
    );
    expect(previewFor({ body: '   ', staffReplyBody: null })).toBeNull();
  });

  test('one line, mentions as names, cut at a word with an ellipsis', () => {
    const long = `Thanks @[Brian Connell](user:u1)\n\n${'word '.repeat(60)}`;
    const preview = previewFor({ body: long, staffReplyBody: null })!;
    expect(preview.startsWith('Thanks @Brian Connell word')).toBe(true);
    expect(preview).not.toContain('\n');
    expect(preview.length).toBeLessThanOrEqual(160);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview).not.toMatch(/ …$/);
  });
});
