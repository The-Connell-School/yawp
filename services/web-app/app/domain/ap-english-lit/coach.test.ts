import { describe, expect, test } from 'bun:test';
import {
  AP_ENGLISH_LIT_COACH_PRINCIPLES,
  buildApEnglishLitCoachInstructions,
  buildApEnglishLitCoachingBlock,
} from './coach';
import { UNIVERSAL_TUTOR_BLOCK } from '../../../../../packages/prisma/scripts/universal-tutor-block';
import { buildApEnglishLitSnapshot } from './schema';

const poetrySnapshot = buildApEnglishLitSnapshot({
  externalKey: 'ap-lit-poetry-example',
  frqType: 'poetry',
  title: 'Poetry example',
  prompt: 'Analyze how the poet conveys the speaker\'s attitude toward time.',
  focusSkill: 'speaker-attitude',
  difficulty: 'exam-ready',
  skillEmphasis: 'evidence-commentary',
  defaultTimeMode: 'timed',
  defaultDurationMinutes: 40,
  suggestedWorks: null,
  provenanceUrl: null,
  sources: [
    {
      externalKey: 'ap-lit-poetry-example-poem',
      position: 1,
      title: 'The Poem',
      attribution: 'A Poet, 1900',
      body: 'Time, that old gardener, prunes us all.',
      caption: null,
      mediaType: 'text',
      imageUrl: null,
      imageAlt: null,
      provenanceUrl: null,
    },
  ],
});

const argumentSnapshot = buildApEnglishLitSnapshot({
  externalKey: 'ap-lit-argument-example',
  frqType: 'literary_argument',
  title: 'Argument example',
  prompt: 'Analyze how a morally ambiguous character shapes an interpretation of the work.',
  focusSkill: 'moral-ambiguity',
  difficulty: 'exam-ready',
  skillEmphasis: 'sophistication',
  defaultTimeMode: 'untimed',
  defaultDurationMinutes: 40,
  suggestedWorks: 'Hamlet\nBeloved',
  provenanceUrl: null,
  sources: [],
});

describe('AP English Literature coach instructions', () => {
  test('the coach principles enforce the coach-not-ghostwriter posture', () => {
    const joined = AP_ENGLISH_LIT_COACH_PRINCIPLES.join(' ').toLowerCase();
    expect(joined).toContain('do not write');
    expect(joined).toContain('so what');
  });

  test('instructions reference all three rubric rows', () => {
    const text = buildApEnglishLitCoachInstructions({
      snapshot: poetrySnapshot,
    });
    expect(text.toLowerCase()).toContain('thesis');
    expect(text.toLowerCase()).toContain('line of reasoning');
    expect(text.toLowerCase()).toContain('sophistication');
  });

  test('explicitly forbids ghostwriting a finished thesis or essay', () => {
    const text = buildApEnglishLitCoachInstructions({
      snapshot: poetrySnapshot,
    });
    expect(text.toLowerCase()).toContain('do not write the thesis');
  });

  test('poetry instructions embed the provided poem for close reading', () => {
    const text = buildApEnglishLitCoachInstructions({
      snapshot: poetrySnapshot,
    });
    expect(text).toContain('Time, that old gardener, prunes us all.');
    expect(text.toLowerCase()).toContain('two-pass');
  });

  test('literary argument instructions withhold text and guard against invented plot', () => {
    const text = buildApEnglishLitCoachInstructions({
      snapshot: argumentSnapshot,
    });
    expect(text.toLowerCase()).toContain('do not invent');
    // Suggested works are offered as options, not required.
    expect(text).toContain('Hamlet');
    // No provided passage exists for the open question.
    expect(text.toLowerCase()).not.toContain('provided passage:');
  });

  test('timed responses surface a time budget', () => {
    const text = buildApEnglishLitCoachInstructions({
      snapshot: poetrySnapshot,
    });
    expect(text).toContain('40');
  });
});

describe('Universal YAWP! Tutor layer', () => {
  test('the coaching block opens with the universal block verbatim', () => {
    const block = buildApEnglishLitCoachingBlock();

    expect(block).toContain(UNIVERSAL_TUTOR_BLOCK);
    expect(block.startsWith(UNIVERSAL_TUTOR_BLOCK)).toBe(true);
  });

  test('every built prompt carries the guardrails this course was missing', () => {
    for (const snapshot of [poetrySnapshot, argumentSnapshot]) {
      const prompt = buildApEnglishLitCoachInstructions({ snapshot });

      expect(prompt).toContain('You are the YAWP! Tutor');
      expect(prompt).toContain("I'm not that kind of guy!");
      expect(prompt).toContain('I am mysterious and I contain');
      expect(prompt).toContain('MULTILINGUAL.');
      // and still carries the AP Lit substance
      expect(prompt).toContain('AP English Literature');
      expect(prompt).toContain(snapshot.prompt);
    }
  });

  test('the universal character comes before the AP Lit specialization', () => {
    const prompt = buildApEnglishLitCoachInstructions({
      snapshot: poetrySnapshot,
    });

    expect(prompt.indexOf('You are the YAWP! Tutor')).toBeLessThan(
      prompt.indexOf('AP English Literature')
    );
  });
});

describe('Where AP Lit narrows the universal rules', () => {
  test('a modeled example may not be built from the student text', () => {
    // Principle 5 allows modeling "one possibility" when a student is stuck.
    // On Q1/Q2 the student has a passage in front of them, so a modeled
    // reading of THAT passage is exactly what they would paste. The universal
    // ONE RULE requires examples be generic; this makes it explicit here.
    const block = buildApEnglishLitCoachingBlock();

    expect(block).toContain('A MODELED EXAMPLE USES A DIFFERENT TEXT');
    expect(block.indexOf('model one possibility')).toBeLessThan(
      block.indexOf('A MODELED EXAMPLE USES A DIFFERENT TEXT')
    );
  });

  test('turn discipline is one note, not two', () => {
    // Principle 6 says "one or two highest-leverage fixes"; the universal rule
    // is the SINGLE most important thing, then let the student act.
    const block = buildApEnglishLitCoachingBlock();

    expect(block).toContain('ONE NOTE PER TURN');
  });
});

describe('Register mode', () => {
  test('the coaching block declares the register', () => {
    expect(buildApEnglishLitCoachingBlock()).toContain(
      'REGISTER MODE FOR THIS MODULE: POLISHED'
    );
  });

  test('mechanics are never the single note on an AP Lit essay', () => {
    expect(buildApEnglishLitCoachingBlock()).toContain(
      'mechanics are never the one thing you raise'
    );
  });
});

describe('Admin-editable coaching block', () => {
  test('a stored block replaces the authored default', () => {
    const prompt = buildApEnglishLitCoachInstructions({
      snapshot: poetrySnapshot,
      coachingBlock: 'EDITED IN ADMIN. Coach like a pirate.',
    });

    expect(prompt.startsWith('EDITED IN ADMIN.')).toBe(true);
    expect(prompt).not.toContain(UNIVERSAL_TUTOR_BLOCK);
    // The assignment-specific half is still composed from the snapshot.
    expect(prompt).toContain(poetrySnapshot.prompt);
    expect(prompt).toContain('Time, that old gardener');
  });

  test('a blank stored block falls back to the authored default', () => {
    for (const empty of [undefined, null, '', '   \n ']) {
      const prompt = buildApEnglishLitCoachInstructions({
        snapshot: poetrySnapshot,
        coachingBlock: empty,
      });
      expect(prompt.startsWith(UNIVERSAL_TUTOR_BLOCK)).toBe(true);
    }
  });

  test('seeding the authored block produces the identical prompt', () => {
    // What the seed writes is what the code would have built, so populating
    // the database changes nothing until an admin edits it.
    expect(
      buildApEnglishLitCoachInstructions({
        snapshot: poetrySnapshot,
        coachingBlock: buildApEnglishLitCoachingBlock(),
      })
    ).toBe(buildApEnglishLitCoachInstructions({ snapshot: poetrySnapshot }));
  });
});
