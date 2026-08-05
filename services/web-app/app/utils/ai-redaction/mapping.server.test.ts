import { describe, expect, test } from 'bun:test';
import { buildRedactionMapping } from './mapping.server';
import { PSEUDONYM_FIRST_NAME_POOL } from './pseudonym-pool.server';

describe('buildRedactionMapping', () => {
  test('assigns a pseudonym from the plausible-name pool, not a placeholder', () => {
    const mapping = buildRedactionMapping(['Maya']);
    const entry = mapping.realToPseudonym.get('maya');

    expect(entry).toBeDefined();
    expect(entry!.pseudonym).not.toBe('Maya');
    expect(entry!.pseudonym).toMatch(/^[A-Za-z]+$/);
    expect(PSEUDONYM_FIRST_NAME_POOL).toContain(entry!.pseudonym);
  });

  test('is deterministic: the same name always maps to the same pseudonym', () => {
    const first = buildRedactionMapping(['Maya']);
    const second = buildRedactionMapping(['Maya']);

    expect(first.realToPseudonym.get('maya')?.pseudonym).toBe(
      second.realToPseudonym.get('maya')?.pseudonym
    );
  });

  test('gives two students who share a first name the same pseudonym', () => {
    const mapping = buildRedactionMapping(['Alex', 'Alex']);

    expect(mapping.realToPseudonym.size).toBe(1);
    expect(mapping.realToPseudonym.get('alex')).toBeDefined();
  });

  test('resolves hash collisions between distinct real names to distinct pseudonyms', () => {
    // Every name in the request must end up with its own, unique pseudonym
    // even when several real names hash to the same starting pool slot.
    const names = [
      'Maya',
      'Noah',
      'Liam',
      'Emma',
      'Olivia',
      'Ava',
      'Sophia',
      'Isabella',
      'Mia',
      'Amelia',
      'Harper',
      'Evelyn',
    ];
    const mapping = buildRedactionMapping(names);
    const pseudonyms = names.map(
      (name) => mapping.realToPseudonym.get(name.toLowerCase())!.pseudonym
    );

    expect(new Set(pseudonyms).size).toBe(names.length);
  });

  test('never assigns a pseudonym that collides with another real name in the same request', () => {
    // "Alex" is in the pool; if a different real student's hash would
    // normally land on "Alex" as their pseudonym, that must be skipped
    // because a real student named Alex is also in this request.
    const mapping = buildRedactionMapping(['Alex', 'Jordan', 'Taylor']);

    for (const [realKey, entry] of mapping.realToPseudonym) {
      expect(entry.pseudonym.toLowerCase()).not.toBe(realKey);
    }
  });

  test('ignores null, undefined, and blank names', () => {
    const mapping = buildRedactionMapping([null, undefined, '', '   ', 'Maya']);

    expect(mapping.realToPseudonym.size).toBe(1);
  });

  test('pseudonymToReal is the exact inverse of realToPseudonym', () => {
    const mapping = buildRedactionMapping(['Maya', 'Noah']);

    for (const entry of mapping.realToPseudonym.values()) {
      expect(mapping.pseudonymToReal.get(entry.pseudonym.toLowerCase())).toBe(
        entry.realName
      );
    }
  });
});
