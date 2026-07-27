import { describe, expect, test } from 'bun:test';
import {
  UNIVERSAL_TUTOR_BLOCK,
  formatRegisterModeDirective,
} from './universal-tutor-block';

describe('UNIVERSAL_TUTOR_BLOCK', () => {
  test('carries every section of the canonical Universal YAWP! Tutor Instructions', () => {
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
      expect(UNIVERSAL_TUTOR_BLOCK).toContain(heading);
    }
  });

  test('opens by establishing the YAWP! Tutor identity', () => {
    expect(UNIVERSAL_TUTOR_BLOCK.trimStart().startsWith('WHO YOU ARE.')).toBe(
      true
    );
    expect(UNIVERSAL_TUTOR_BLOCK).toContain('You are the YAWP! Tutor');
  });

  test('carries the two verbatim tutor lines word for word', () => {
    // These are the Tutor's voice. They are quoted exactly in the canonical
    // doc, so a paraphrase here is a regression.
    expect(UNIVERSAL_TUTOR_BLOCK).toContain(
      "\"I'm not that kind of guy! And anyway, the whole point is for YOU to figure out and share what YOU think. I know it isn't always easy, but if you take a little time, you can do great work.\""
    );
    expect(UNIVERSAL_TUTOR_BLOCK).toContain(
      '"I am mysterious and I contain so many multitudes that it would take the rest of your life to understand me. On the plus side, I can help you with your writing! Let\'s get back to that."'
    );
  });

  test('states the paste test and the named dodges students use', () => {
    expect(UNIVERSAL_TUTOR_BLOCK).toContain(
      'Could the student paste this in as a finished sentence or paragraph?'
    );
    for (const dodge of [
      'just give me an example',
      'show me what it would look like',
      'rewrite this for me',
      'write one I can adapt',
    ]) {
      expect(UNIVERSAL_TUTOR_BLOCK).toContain(dodge);
    }
  });

  test('defines both register modes so a module can select one', () => {
    expect(UNIVERSAL_TUTOR_BLOCK).toContain('DRAFTING');
    expect(UNIVERSAL_TUTOR_BLOCK).toContain('POLISHED');
    expect(UNIVERSAL_TUTOR_BLOCK).toContain(
      'never flag mechanics; stay entirely on ideas'
    );
  });

  test('is assignment-agnostic: no course-specific vocabulary leaks in', () => {
    // The block is pasted into every assignment, so it must say "the student's
    // work", never "the essay", "the DBQ", etc.
    for (const courseWord of ['DBQ', 'LEQ', 'AP History', 'rubric point']) {
      expect(UNIVERSAL_TUTOR_BLOCK).not.toContain(courseWord);
    }
  });
});

describe('formatRegisterModeDirective', () => {
  test('renders the module-selected mode as an explicit directive', () => {
    expect(formatRegisterModeDirective('drafting')).toBe(
      'REGISTER MODE FOR THIS MODULE: DRAFTING — messiness, typos, and rambling are fine; give zero mechanics/formality feedback; ideas only.'
    );
    expect(formatRegisterModeDirective('polished')).toContain(
      'REGISTER MODE FOR THIS MODULE: POLISHED'
    );
  });
});
