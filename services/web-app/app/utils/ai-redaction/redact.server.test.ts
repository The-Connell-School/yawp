import { describe, expect, test } from 'bun:test';
import {
  buildRedactionMapping,
  redactableNamePartsFromFullName,
} from './mapping.server';
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

  test('does not redact a bare surname that is also an ordinary word', () => {
    // Reproduces the reverted defect: 'Marcus Green' registered both parts,
    // so 'Green energy is the future. Many green initiatives...' went to the
    // provider as 'Dakota energy is the future. Many dakota initiatives...'
    // - the student's own essay, mangled, and graded in that state.
    const mapping = buildRedactionMapping(
      redactableNamePartsFromFullName('Marcus Green')
    );

    const essay =
      'Green energy is the future. Many green initiatives start small.';

    expect(redact(essay, mapping, { mode: 'prose' })).toBe(essay);
  });

  test('does not redact bare surnames that are ordinary words in any casing', () => {
    for (const [fullName, essay] of [
      ['Ana Brown', 'The lights brown out during the storm.'],
      ['Tim Young', 'The young reader is not the intended audience.'],
      ['Nia White', 'White space on the page carries meaning.'],
      ['Omar Long', 'The long march toward reform is unfinished.'],
    ] as const) {
      const mapping = buildRedactionMapping(
        redactableNamePartsFromFullName(fullName)
      );
      expect(redact(essay, mapping, { mode: 'prose' })).toBe(essay);
    }
  });

  test('still redacts a surname when the first name makes it unambiguous', () => {
    const mapping = buildRedactionMapping(
      redactableNamePartsFromFullName('Marcus Green')
    );
    const first = mapping.realToPseudonym.get('marcus')!.pseudonym;
    const last = mapping.realToPseudonym.get('green')!.pseudonym;

    const signed = 'A personal narrative by Marcus Green.';
    const out = redact(signed, mapping, { mode: 'prose' });

    expect(out).toBe(`A personal narrative by ${first} ${last}.`);
    expect(rehydrate(out, mapping)).toBe(signed);
  });

  test('redacts every part of a multi-part full name signature', () => {
    const mapping = buildRedactionMapping(
      redactableNamePartsFromFullName('Sophia Marín Lopez')
    );

    const out = redact('-- Sophia Marín Lopez', mapping, { mode: 'prose' });

    expect(out).not.toContain('Sophia');
    expect(out).not.toContain('Marín');
    expect(out).not.toContain('Lopez');
    expect(rehydrate(out, mapping)).toBe('-- Sophia Marín Lopez');
  });

  test('still redacts a surname after an honorific', () => {
    const mapping = buildRedactionMapping(
      redactableNamePartsFromFullName('Marcus Green')
    );
    const last = mapping.realToPseudonym.get('green')!.pseudonym;

    expect(redact('Mr. Green graded it.', mapping, { mode: 'prose' })).toBe(
      `Mr. ${last} graded it.`
    );
    expect(redact('Ms Green graded it.', mapping, { mode: 'prose' })).toBe(
      `Ms ${last} graded it.`
    );
  });

  test('field mode still redacts a bare surname, because field values are ours', () => {
    const mapping = buildRedactionMapping(
      redactableNamePartsFromFullName('Marcus Green')
    );
    const last = mapping.realToPseudonym.get('green')!.pseudonym;

    expect(redact('Green', mapping)).toBe(last);
  });

  test('does not register the "Student" display fallback as a redaction key', () => {
    // firstNameFromFullName returns the literal 'Student' for a nameless
    // account. Registering it rewrote the word inside the teacher's own
    // assignment prompt.
    const mapping = buildRedactionMapping(redactableNamePartsFromFullName(null));

    expect(mapping.realToPseudonym.size).toBe(0);
    expect(
      redact('Describe a time a student changed your mind.', mapping, {
        mode: 'prose',
      })
    ).toBe('Describe a time a student changed your mind.');
  });

  test('prose redaction round-trips through rehydrate', () => {
    const mapping = buildRedactionMapping(['Sophia']);
    const essay = 'Sophia argued that Sophia’s silence was inherited.';

    const redacted = redact(essay, mapping, { mode: 'prose' });
    expect(redacted).not.toContain('Sophia');
    expect(rehydrate(redacted, mapping)).toBe(essay);
  });
});
