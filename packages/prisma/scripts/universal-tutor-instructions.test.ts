import { describe, expect, test } from 'bun:test';
import {
  UNIVERSAL_TUTOR_INSTRUCTIONS,
  UNIVERSAL_TUTOR_INSTRUCTIONS_MARKER,
  ensureUniversalTutorInstructions,
  hasUniversalTutorInstructions,
} from './universal-tutor-instructions';

describe('UNIVERSAL_TUTOR_INSTRUCTIONS', () => {
  test('carries every section of the canonical universal block', () => {
    for (const heading of [
      'WHO YOU ARE.',
      "THE ONE RULE — NEVER WRITE THE STUDENT'S WORK, BUT ALWAYS SCAFFOLD.",
      'OFF-TOPIC / PERSONAL QUESTIONS.',
      'KEEP IT SHORT — ONE THING AT A TIME.',
      'PAIR VIVID LANGUAGE WITH CONCRETE HELP.',
      'HONOR VOICE — AND MATCH THE STAGE.',
      'REGISTER MODE',
      "BLESS GOOD WORK; DON'T BLESS WEAK WORK.",
      'MULTILINGUAL.',
      'TONE.',
    ]) {
      expect(UNIVERSAL_TUTOR_INSTRUCTIONS).toContain(heading);
    }
  });

  test('keeps the verbatim guardrail language the tutor is judged on', () => {
    expect(UNIVERSAL_TUTOR_INSTRUCTIONS).toContain(
      "I'm not that kind of guy!"
    );
    expect(UNIVERSAL_TUTOR_INSTRUCTIONS).toContain(
      'I am mysterious and I contain so many multitudes'
    );
    expect(UNIVERSAL_TUTOR_INSTRUCTIONS).toContain('DRAFTING');
    expect(UNIVERSAL_TUTOR_INSTRUCTIONS).toContain('POLISHED');
  });

  test('is assignment-agnostic: never names a specific essay or course', () => {
    expect(UNIVERSAL_TUTOR_INSTRUCTIONS).not.toContain('APUSH');
    expect(UNIVERSAL_TUTOR_INSTRUCTIONS).not.toContain('DBQ');
    expect(UNIVERSAL_TUTOR_INSTRUCTIONS).not.toContain('LEQ');
  });

  test('is trimmed and non-empty', () => {
    expect(UNIVERSAL_TUTOR_INSTRUCTIONS.trim()).toBe(
      UNIVERSAL_TUTOR_INSTRUCTIONS
    );
    expect(UNIVERSAL_TUTOR_INSTRUCTIONS.length).toBeGreaterThan(1000);
  });

  test('contains its own detection marker', () => {
    expect(UNIVERSAL_TUTOR_INSTRUCTIONS).toContain(
      UNIVERSAL_TUTOR_INSTRUCTIONS_MARKER
    );
  });
});

describe('hasUniversalTutorInstructions', () => {
  test('is false for empty or whitespace-only instructions', () => {
    expect(hasUniversalTutorInstructions(null)).toBe(false);
    expect(hasUniversalTutorInstructions(undefined)).toBe(false);
    expect(hasUniversalTutorInstructions('')).toBe(false);
    expect(hasUniversalTutorInstructions('   \n  ')).toBe(false);
  });

  test('is false for course-specific instructions that lack the block', () => {
    expect(
      hasUniversalTutorInstructions('Coach the student through an APUSH DBQ.')
    ).toBe(false);
  });

  test('is true once the block is present', () => {
    expect(hasUniversalTutorInstructions(UNIVERSAL_TUTOR_INSTRUCTIONS)).toBe(
      true
    );
    expect(
      hasUniversalTutorInstructions(
        `${UNIVERSAL_TUTOR_INSTRUCTIONS}\n\nCourse notes.`
      )
    ).toBe(true);
  });
});

describe('ensureUniversalTutorInstructions', () => {
  test('sets the block when there are no instructions yet', () => {
    expect(ensureUniversalTutorInstructions(null)).toBe(
      UNIVERSAL_TUTOR_INSTRUCTIONS
    );
    expect(ensureUniversalTutorInstructions(undefined)).toBe(
      UNIVERSAL_TUTOR_INSTRUCTIONS
    );
    expect(ensureUniversalTutorInstructions('   ')).toBe(
      UNIVERSAL_TUTOR_INSTRUCTIONS
    );
  });

  test('prepends the block while preserving existing course-specific text', () => {
    const existing = 'Coach the student through an APUSH DBQ.';

    const result = ensureUniversalTutorInstructions(existing);

    expect(result.startsWith(UNIVERSAL_TUTOR_INSTRUCTIONS)).toBe(true);
    expect(result).toContain(existing);
    expect(result).toBe(`${UNIVERSAL_TUTOR_INSTRUCTIONS}\n\n${existing}`);
  });

  test('leaves instructions untouched when the block is already there', () => {
    const existing = `${UNIVERSAL_TUTOR_INSTRUCTIONS}\n\nCoach the student through an APUSH DBQ.`;

    expect(ensureUniversalTutorInstructions(existing)).toBe(existing);
  });

  test('is idempotent across repeated runs', () => {
    const once = ensureUniversalTutorInstructions('Course notes.');
    const twice = ensureUniversalTutorInstructions(once);

    expect(twice).toBe(once);
  });
});
