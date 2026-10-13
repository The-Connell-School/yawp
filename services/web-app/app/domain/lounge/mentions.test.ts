import { describe, expect, test } from 'bun:test';
import {
  decodeMentions,
  encodeMentions,
  findMentionQuery,
  mentionToken,
  mentionedUserIds,
  plainTextWithMentions,
  splitMentions,
} from './mentions';

describe('mention tokens', () => {
  test('a token carries the name and the user id', () => {
    expect(mentionToken('Brian Connell', 'u1')).toBe('@[Brian Connell](user:u1)');
  });

  test('brackets and parentheses in a name cannot break the token', () => {
    expect(mentionToken('Ann [AP] (Lit)', 'u2')).toBe('@[Ann AP Lit](user:u2)');
  });

  test('collects each mentioned user once, in order', () => {
    const body = 'Hi @[Brian Connell](user:u1) and @[Maria S.](user:u2), thanks @[Brian Connell](user:u1)';
    expect(mentionedUserIds(body)).toEqual(['u1', 'u2']);
  });

  test('ignores text that only looks like a mention', () => {
    expect(mentionedUserIds('email me @ school or @Brian')).toEqual([]);
  });

  test('splits a body into text and mention parts for display', () => {
    expect(splitMentions('Thanks @[Brian Connell](user:u1)!')).toEqual([
      { type: 'text', text: 'Thanks ' },
      { type: 'mention', userId: 'u1', label: 'Brian Connell' },
      { type: 'text', text: '!' },
    ]);
  });

  test('plain text renders mentions as @Name for emails and previews', () => {
    expect(plainTextWithMentions('Ask @[Brian Connell](user:u1) here')).toBe('Ask @Brian Connell here');
  });
});

describe('findMentionQuery', () => {
  test('finds the word being typed after @', () => {
    expect(findMentionQuery('two examples? @Bri')).toEqual({ query: 'Bri', start: 14 });
  });

  test('an @ on its own opens the list with an empty query', () => {
    expect(findMentionQuery('Hello @')).toEqual({ query: '', start: 6 });
  });

  test('allows a space so a first and last name can be typed', () => {
    expect(findMentionQuery('cc @Brian Con')).toEqual({ query: 'Brian Con', start: 3 });
  });

  test('is null for an email address or when nothing is being typed', () => {
    expect(findMentionQuery('write to kevin@yawp')).toBeNull();
    expect(findMentionQuery('no mention here')).toBeNull();
  });

  test('stops after a completed token', () => {
    expect(findMentionQuery('@[Brian Connell](user:u1) ')).toBeNull();
  });
});

describe('encodeMentions / decodeMentions', () => {
  const brian = { userId: 'u1', label: 'Brian Connell' };
  const maria = { userId: 'u2', label: 'Maria S.' };

  test('turns picked "@Name" text into tokens', () => {
    expect(encodeMentions('Thanks @Brian Connell, and @Maria S. too', [brian, maria])).toBe(
      'Thanks @[Brian Connell](user:u1), and @[Maria S.](user:u2) too'
    );
  });

  test('leaves a mention alone once its text was edited away', () => {
    expect(encodeMentions('Thanks @Brian C', [brian])).toBe('Thanks @Brian C');
  });

  test('does not match a longer word that starts with the name', () => {
    expect(encodeMentions('@Brian Connelly', [brian])).toBe('@Brian Connelly');
  });

  test('round-trips through decode for editing', () => {
    const encoded = 'Hi @[Brian Connell](user:u1)!';
    const decoded = decodeMentions(encoded);
    expect(decoded).toEqual({ text: 'Hi @Brian Connell!', mentions: [brian] });
    expect(encodeMentions(decoded.text, decoded.mentions)).toBe(encoded);
  });
});
