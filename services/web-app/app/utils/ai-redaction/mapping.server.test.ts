import { afterEach, describe, expect, test } from 'bun:test';
import { buildRedactionMapping, withAliasKey } from './mapping.server';
import { PSEUDONYM_FIRST_NAME_POOL } from './pseudonym-pool.server';

describe('buildRedactionMapping kill switch', () => {
  const ORIGINAL = process.env.AI_PII_REDACTION_ENABLED;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.AI_PII_REDACTION_ENABLED;
    else process.env.AI_PII_REDACTION_ENABLED = ORIGINAL;
  });

  test('is on by default (no env var set)', () => {
    delete process.env.AI_PII_REDACTION_ENABLED;
    const mapping = buildRedactionMapping(['Maya']);
    expect(mapping.realToPseudonym.size).toBe(1);
  });

  test('AI_PII_REDACTION_ENABLED=false disables redaction entirely - names pass through unmapped', () => {
    process.env.AI_PII_REDACTION_ENABLED = 'false';
    const mapping = buildRedactionMapping(['Maya']);
    expect(mapping.realToPseudonym.size).toBe(0);
  });

  test('any other value keeps redaction on', () => {
    process.env.AI_PII_REDACTION_ENABLED = 'nonsense';
    const mapping = buildRedactionMapping(['Maya']);
    expect(mapping.realToPseudonym.size).toBe(1);
  });
});

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

describe('withAliasKey', () => {
  test('adds a lookup key that resolves to the same pseudonym as the canonical name', () => {
    const mapping = buildRedactionMapping(['Sophia Marín']);
    const canonical = mapping.realToPseudonym.get('sophia marín')!;

    const aliased = withAliasKey(mapping, 'Sophia', 'Sophia Marín');

    expect(aliased.realToPseudonym.get('sophia')?.pseudonym).toBe(
      canonical.pseudonym
    );
  });

  test('does not overwrite an alias key that is already registered under a different pseudonym', () => {
    // Two different students share the first name "Alex" - the bare first
    // name is ambiguous between them, so aliasing must not silently pick one.
    let mapping = buildRedactionMapping(['Alex Rivera', 'Alex Chen']);
    const riveraPseudonym = mapping.realToPseudonym.get('alex rivera')!
      .pseudonym;

    mapping = withAliasKey(mapping, 'Alex', 'Alex Rivera');
    // "alex" was never registered on its own, so the alias attaches to
    // whichever canonical name asks for it first.
    expect(mapping.realToPseudonym.get('alex')?.pseudonym).toBe(
      riveraPseudonym
    );

    const chenPseudonym = mapping.realToPseudonym.get('alex chen')!.pseudonym;
    const beforeSecondAlias = mapping.realToPseudonym.get('alex')?.pseudonym;
    mapping = withAliasKey(mapping, 'Alex', 'Alex Chen');

    // A second, conflicting alias attempt must not clobber the first.
    expect(mapping.realToPseudonym.get('alex')?.pseudonym).toBe(
      beforeSecondAlias
    );
    expect(mapping.realToPseudonym.get('alex')?.pseudonym).not.toBe(
      chenPseudonym
    );
  });

  test('is a no-op if the canonical name was never registered', () => {
    const mapping = buildRedactionMapping(['Sophia Marín']);

    const aliased = withAliasKey(mapping, 'Priya', 'Priya Patel');

    expect(aliased.realToPseudonym.get('priya')).toBeUndefined();
  });
});
