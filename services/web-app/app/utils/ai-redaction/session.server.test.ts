import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createRedactionSession } from './session.server';
import { redact, rehydrate } from './redact.server';
import { ORG_PSEUDONYM_NAME_POOL } from './org-pseudonym-pool.server';

describe('createRedactionSession', () => {
  describe('with the AI_PII_REDACTION_ENABLED kill switch off', () => {
    const ORIGINAL = process.env.AI_PII_REDACTION_ENABLED;
    beforeEach(() => {
      process.env.AI_PII_REDACTION_ENABLED = 'false';
    });
    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.AI_PII_REDACTION_ENABLED;
      else process.env.AI_PII_REDACTION_ENABLED = ORIGINAL;
    });

    test('pseudonymFor returns the real name instead of throwing', () => {
      const session = createRedactionSession();

      expect(session.pseudonymFor('Amelia Brooks')).toBe('Amelia Brooks');
    });

    test('registerStudentFullName returns the real name instead of throwing', () => {
      const session = createRedactionSession();

      expect(session.registerStudentFullName('Amelia Brooks')).toBe(
        'Amelia Brooks'
      );
    });

    test('redact against the session mapping is a pass-through', () => {
      const session = createRedactionSession();
      session.registerStudentFullName('Amelia Brooks');

      expect(redact('Amelia Brooks wrote this.', session.mapping)).toBe(
        'Amelia Brooks wrote this.'
      );
    });
  });

  test('registers a new real name on first lookup and reuses it after', () => {
    const session = createRedactionSession();

    const first = session.pseudonymFor('Amelia Brooks');
    const second = session.pseudonymFor('Amelia Brooks');

    expect(first).toBe(second);
    expect(first).not.toBe('Amelia Brooks');
  });

  test('names registered mid-conversation stay redacted going forward and rehydrate correctly at the end', () => {
    const session = createRedactionSession();

    // Turn 1: only one student's name is known.
    const p1 = session.pseudonymFor('Amelia Brooks');
    // Turn 2 (a later tool call): a second student surfaces.
    const p2 = session.pseudonymFor('Noah Diaz');

    expect(p1).not.toBe(p2);

    const modelReply = `${p1} improved steadily; ${p2} needs support.`;
    const restored = rehydrate(modelReply, session.mapping);

    expect(restored).toBe(
      'Amelia Brooks improved steadily; Noah Diaz needs support.'
    );
  });

  test('two students sharing a first name still get distinct pseudonyms via full-name registration', () => {
    const session = createRedactionSession();

    const p1 = session.pseudonymFor('Alex Rivera');
    const p2 = session.pseudonymFor('Alex Chen');

    expect(p1).not.toBe(p2);
  });

  test('passing a name pool scopes the session to that pool (e.g. organization names)', () => {
    const session = createRedactionSession(ORG_PSEUDONYM_NAME_POOL);

    const pseudonym = session.pseudonymFor('The Connell School');

    expect(ORG_PSEUDONYM_NAME_POOL).toContain(pseudonym);
    expect(pseudonym).not.toBe('The Connell School');
  });

  test('redact() against the session mapping matches pseudonymFor()', () => {
    const session = createRedactionSession();
    const pseudonym = session.pseudonymFor('Amelia Brooks');

    expect(redact('Amelia Brooks', session.mapping)).toBe(pseudonym);
  });

  test('registerStudentFullName() also catches a later first-name-only mention (e.g. a stored overallComment)', () => {
    // Reporter registers students by full name so two students sharing a
    // first name still rehydrate unambiguously (see the test above). But
    // grading always addresses a student by first name only in stored
    // feedback ("Sophia, you've written..."), and Reporter tool results
    // echo that stored text back into the outbound prompt. Without this
    // alias, the bare first name sails through redact() untouched because
    // only the two-word "Sophia Marín" key was ever registered.
    const session = createRedactionSession();
    const pseudonym = session.registerStudentFullName('Sophia Marín');

    const priorFeedback =
      "Sophia, you've written something rare: an essay that makes silence visible.";
    const redacted = redact(priorFeedback, session.mapping);

    expect(redacted).not.toContain('Sophia');
    expect(redacted.startsWith(pseudonym)).toBe(true);
  });

  test('a first-name-only mention round-trips back to the first name, not the full name', () => {
    // Reproduces the reverted defect: withAliasKey registered the alias in
    // one direction only, so "Sophia, you have a strong thesis." came back
    // out of rehydrate as "Sophia Martinez, you have a strong thesis." —
    // every quoted comment silently gaining a surname in text the teacher
    // reads and that is persisted to ReporterMessage.content.
    const session = createRedactionSession();
    session.registerStudentFullName('Sophia Martinez');

    const original = 'Sophia, you have a strong thesis but thin evidence.';
    const redacted = redact(original, session.mapping, { mode: 'prose' });

    expect(redacted).not.toContain('Sophia');
    expect(rehydrate(redacted, session.mapping)).toBe(original);
  });

  test('registerStudentFullName() resolves a shared-first-name alias to whichever student claimed it first, and never lets a second claimant overwrite it', () => {
    const session = createRedactionSession();
    const riveraPseudonym = session.registerStudentFullName('Alex Rivera');
    const chenPseudonym = session.registerStudentFullName('Alex Chen');
    expect(riveraPseudonym).not.toBe(chenPseudonym);

    // Privacy comes first: a bare "Alex" is still redacted (no real name
    // ever reaches the prompt), even though - because the alias is
    // genuinely ambiguous between two students - it always resolves to the
    // first claimant's pseudonym rather than the correct one for every
    // mention.
    const redacted = redact(
      'Alex turned in strong work this week.',
      session.mapping
    );
    expect(redacted).not.toContain('Alex');
    expect(
      redacted.startsWith(riveraPseudonym) || redacted.startsWith(chenPseudonym)
    ).toBe(true);
  });
});
