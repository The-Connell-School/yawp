import { describe, expect, test } from 'bun:test';
import { buildRedactionMapping } from './mapping.server';
import { redact, rehydrate } from './redact.server';

describe('redact', () => {
  test('replaces the real name with the pseudonym', () => {
    const mapping = buildRedactionMapping(['Maya']);
    const pseudonym = mapping.realToPseudonym.get('maya')!.pseudonym;

    const out = redact('Maya, your essay shows strong evidence.', mapping);

    expect(out).toBe(`${pseudonym}, your essay shows strong evidence.`);
    expect(out).not.toContain('Maya');
  });

  test('never lets the real name reach the outbound text, across case and possessive variants', () => {
    const mapping = buildRedactionMapping(['Maya']);

    const out = redact(
      "maya wrote about MAYA's trip. Maya's thesis is clear.",
      mapping
    );

    expect(out.toLowerCase()).not.toContain('maya');
  });

  test('does not touch names that are only a substring of another word', () => {
    const mapping = buildRedactionMapping(['Max']);
    const pseudonym = mapping.realToPseudonym.get('max')!.pseudonym;

    const out = redact('Maxine wrote about Max.', mapping);

    expect(out).toContain('Maxine');
    expect(out).toContain(pseudonym);
  });

  test('leaves text untouched when there is nothing to redact', () => {
    const mapping = buildRedactionMapping([]);
    expect(redact('No names here.', mapping)).toBe('No names here.');
  });
});

describe('rehydrate', () => {
  test('round-trips: redact then rehydrate returns the original name', () => {
    const mapping = buildRedactionMapping(['Maya']);
    const original = 'Maya, your essay shows strong evidence. Maya’s thesis is clear.';

    const redacted = redact(original, mapping);
    const restored = rehydrate(redacted, mapping);

    expect(restored).toBe(original);
  });

  test('no pseudonym survives rehydration and reaches the UI', () => {
    const mapping = buildRedactionMapping(['Maya']);
    const pseudonym = mapping.realToPseudonym.get('maya')!.pseudonym;
    const modelResponse = `${pseudonym}, great work on this essay. ${pseudonym}'s argument is persuasive.`;

    const restored = rehydrate(modelResponse, mapping);

    expect(restored).not.toContain(pseudonym);
    expect(restored).toContain('Maya');
  });

  test('is robust to the model changing the pseudonym’s capitalization', () => {
    const mapping = buildRedactionMapping(['Maya']);
    const pseudonym = mapping.realToPseudonym.get('maya')!.pseudonym;

    const lower = rehydrate(`${pseudonym.toLowerCase()}, nice work.`, mapping);
    const upper = rehydrate(`${pseudonym.toUpperCase()}, NICE WORK.`, mapping);

    expect(lower.startsWith('maya,')).toBe(true);
    expect(upper.startsWith('MAYA,')).toBe(true);
  });

  test('is robust to possessive forms the model may introduce', () => {
    const mapping = buildRedactionMapping(['Maya']);
    const pseudonym = mapping.realToPseudonym.get('maya')!.pseudonym;

    const straightApostrophe = rehydrate(`${pseudonym}'s essay is strong.`, mapping);
    const curlyApostrophe = rehydrate(`${pseudonym}’s essay is strong.`, mapping);

    expect(straightApostrophe).toBe("Maya's essay is strong.");
    expect(curlyApostrophe).toBe('Maya’s essay is strong.');
  });

  test('handles two students sharing a first name without cross-contaminating other pseudonyms', () => {
    const mapping = buildRedactionMapping(['Alex', 'Alex', 'Jordan']);
    const alexPseudonym = mapping.realToPseudonym.get('alex')!.pseudonym;
    const jordanPseudonym = mapping.realToPseudonym.get('jordan')!.pseudonym;

    expect(alexPseudonym).not.toBe(jordanPseudonym);

    const modelResponse = `${alexPseudonym} and ${jordanPseudonym} worked together.`;
    const restored = rehydrate(modelResponse, mapping);

    expect(restored).toBe('Alex and Jordan worked together.');
  });

  test('leaves text untouched when there is nothing to rehydrate', () => {
    const mapping = buildRedactionMapping([]);
    expect(rehydrate('No names here.', mapping)).toBe('No names here.');
  });
});
