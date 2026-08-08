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

  test('is robust to the model shouting the pseudonym in a heading', () => {
    const mapping = buildRedactionMapping(['Maya']);
    const pseudonym = mapping.realToPseudonym.get('maya')!.pseudonym;

    const upper = rehydrate(`${pseudonym.toUpperCase()}, NICE WORK.`, mapping);

    expect(upper.startsWith('MAYA,')).toBe(true);
  });

  test('does not rehydrate an all-lowercase pseudonym, which is an ordinary word not a person', () => {
    // A pseudonym is a proper noun we minted; every legitimate reference to
    // it in model output is capitalized. A lowercase occurrence is, by
    // definition, the ordinary English word - see the pool test below.
    const mapping = buildRedactionMapping(['Isaac'], ['Drew']);

    expect(rehydrate('you drew a clear connection.', mapping)).toBe(
      'you drew a clear connection.'
    );
    expect(rehydrate('Drew, nice work.', mapping)).toBe('Isaac, nice work.');
  });

  test('never rewrites an ordinary English word into a real student name', () => {
    // Reproduces the reverted defect: a pseudonym that is also a common word
    // turned "you drew a clear connection" into "you isaac a clear
    // connection", in text persisted as Submission.overallComment and read
    // by the teacher and the student.
    const mapping = buildRedactionMapping(['Isaac'], ['Drew']);

    const modelOutput =
      'Drew, your essay drew a clear line between cause and effect. You drew on strong evidence.';

    expect(rehydrate(modelOutput, mapping)).toBe(
      'Isaac, your essay drew a clear line between cause and effect. You drew on strong evidence.'
    );
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

describe('redact prose mode', () => {
  test('redacts the student name written inside their own essay', () => {
    const mapping = buildRedactionMapping(['Sophia']);
    const pseudonym = mapping.realToPseudonym.get('sophia')!.pseudonym;

    const essay =
      'My grandmother never spoke of it. Sophia, she wrote, you must not be late.';
    const out = redact(essay, mapping, { mode: 'prose' });

    expect(out).not.toContain('Sophia');
    expect(out).toContain(pseudonym);
  });

  test('does not mangle a common word that happens to be the student name', () => {
    const mapping = buildRedactionMapping(['Will']);
    const pseudonym = mapping.realToPseudonym.get('will')!.pseudonym;

    const essay =
      'I will argue that free will is an illusion, and that we will never settle it.';
    const out = redact(essay, mapping, { mode: 'prose' });

    expect(out).toBe(essay);
    expect(out).not.toContain(pseudonym);
  });

  test('still redacts a common-word name when it is capitalized as a name', () => {
    const mapping = buildRedactionMapping(['Grace']);
    const pseudonym = mapping.realToPseudonym.get('grace')!.pseudonym;

    const essay = 'Grace wrote this essay about grace under pressure.';
    const out = redact(essay, mapping, { mode: 'prose' });

    expect(out).toBe(`${pseudonym} wrote this essay about grace under pressure.`);
  });

  test('field mode stays case-insensitive for common-word names', () => {
    const mapping = buildRedactionMapping(['Will']);
    const pseudonym = mapping.realToPseudonym.get('will')!.pseudonym;

    expect(redact('will', mapping)).toBe(pseudonym.toLowerCase());
  });

  test('prose redaction round-trips through rehydrate', () => {
    const mapping = buildRedactionMapping(['Sophia']);
    const essay = 'Sophia argued that Sophia’s silence was inherited.';

    const redacted = redact(essay, mapping, { mode: 'prose' });
    expect(redacted).not.toContain('Sophia');
    expect(rehydrate(redacted, mapping)).toBe(essay);
  });
});
