import { describe, expect, test } from 'bun:test';
import {
  AP_ENGLISH_LANG_COACH_PRINCIPLES,
  buildApEnglishLangCoachInstructions,
  buildApEnglishLangCoachingBlock,
} from './coach';
import { UNIVERSAL_TUTOR_BLOCK } from '../../../../../packages/prisma/scripts/universal-tutor-block';
import { buildApEnglishLangSnapshot } from './schema';

function snapshotFor(frqType: 'synthesis' | 'rhetorical_analysis' | 'argument') {
  if (frqType === 'synthesis') {
    return buildApEnglishLangSnapshot({
      externalKey: 'ap-lang-synthesis-demo',
      frqType: 'synthesis',
      title: 'Demo',
      prompt: 'Take a position on school start times.',
      focusSkill: 'source-integration',
      difficulty: 'exam-ready',
      skillEmphasis: 'evidence-commentary',
      defaultTimeMode: 'untimed',
      defaultDurationMinutes: 40,
      suggestedEvidence: null,
      provenanceUrl: null,
      sources: [1, 2, 3, 4, 5, 6].map((position) => ({
        externalKey: `demo-source-${position}`,
        position,
        title: `Source ${String.fromCharCode(64 + position)}`,
        attribution: 'Practice source',
        body: `Body of source ${position}.`,
        caption: null,
        mediaType: position === 6 ? 'image' : 'text',
        imageUrl: position === 6 ? '/img/chart.png' : null,
        imageAlt: position === 6 ? 'A chart of start times' : null,
        provenanceUrl: null,
      })),
    });
  }

  if (frqType === 'rhetorical_analysis') {
    return buildApEnglishLangSnapshot({
      externalKey: 'ap-lang-rhetorical-demo',
      frqType: 'rhetorical_analysis',
      title: 'Demo',
      prompt: 'Analyze the rhetorical choices Douglass makes.',
      focusSkill: 'rhetorical-situation',
      difficulty: 'exam-ready',
      skillEmphasis: 'evidence-commentary',
      defaultTimeMode: 'untimed',
      defaultDurationMinutes: 40,
      suggestedEvidence: null,
      provenanceUrl: null,
      sources: [
        {
          externalKey: 'demo-passage',
          position: 1,
          title: 'What to the Slave Is the Fourth of July?',
          attribution: 'Frederick Douglass, 1852 (public domain)',
          body: 'Fellow-citizens, pardon me...',
          caption: null,
          mediaType: 'text',
          imageUrl: null,
          imageAlt: null,
          provenanceUrl: null,
        },
      ],
    });
  }

  return buildApEnglishLangSnapshot({
    externalKey: 'ap-lang-argument-demo',
    frqType: 'argument',
    title: 'Demo',
    prompt: 'Take a position on the value of disagreement.',
    focusSkill: 'line-of-reasoning',
    difficulty: 'exam-ready',
    skillEmphasis: 'sophistication',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: 'The Civil Rights Movement\nThe scientific revolution',
    provenanceUrl: null,
    sources: [],
  });
}

describe('buildApEnglishLangCoachInstructions', () => {
  test('embeds every coaching principle', () => {
    const instructions = buildApEnglishLangCoachInstructions({
      snapshot: snapshotFor('argument'),
    });
    for (const principle of AP_ENGLISH_LANG_COACH_PRINCIPLES) {
      expect(instructions).toContain(principle);
    }
  });

  test('embeds all three rubric rows', () => {
    const instructions = buildApEnglishLangCoachInstructions({
      snapshot: snapshotFor('argument'),
    });
    expect(instructions).toContain('Thesis');
    expect(instructions).toContain('Evidence and Commentary');
    expect(instructions).toContain('Sophistication');
  });

  test('embeds the prompt', () => {
    const instructions = buildApEnglishLangCoachInstructions({
      snapshot: snapshotFor('rhetorical_analysis'),
    });
    expect(instructions).toContain('Analyze the rhetorical choices Douglass makes.');
  });

  test('forbids ghostwriting', () => {
    const instructions = buildApEnglishLangCoachInstructions({
      snapshot: snapshotFor('synthesis'),
    });
    expect(instructions.toLowerCase()).toContain('do not ghostwrite');
  });

  test('synthesis instructions include every provided source and the three-source floor', () => {
    const instructions = buildApEnglishLangCoachInstructions({
      snapshot: snapshotFor('synthesis'),
    });
    for (const position of [1, 2, 3, 4, 5, 6]) {
      expect(instructions).toContain(`Body of source ${position}.`);
    }
    expect(instructions).toContain('at least three');
  });

  test('synthesis instructions describe the visual source', () => {
    const instructions = buildApEnglishLangCoachInstructions({
      snapshot: snapshotFor('synthesis'),
    });
    expect(instructions).toContain('A chart of start times');
  });

  test('rhetorical analysis instructions embed the passage and warn against device lists', () => {
    const instructions = buildApEnglishLangCoachInstructions({
      snapshot: snapshotFor('rhetorical_analysis'),
    });
    expect(instructions).toContain('Fellow-citizens, pardon me...');
    expect(instructions.toLowerCase()).toContain('choices');
    expect(instructions.toLowerCase()).toContain('device');
  });

  test('argument instructions offer suggested evidence and forbid inventing facts', () => {
    const instructions = buildApEnglishLangCoachInstructions({
      snapshot: snapshotFor('argument'),
    });
    expect(instructions).toContain('The Civil Rights Movement');
    expect(instructions.toLowerCase()).toContain('do not invent');
  });

  test('argument instructions ship no provided passage block', () => {
    const instructions = buildApEnglishLangCoachInstructions({
      snapshot: snapshotFor('argument'),
    });
    expect(instructions).not.toContain('Provided passage');
  });

  test('mentions the reading period and time budget', () => {
    const instructions = buildApEnglishLangCoachInstructions({
      snapshot: snapshotFor('synthesis'),
    });
    expect(instructions).toContain('40-minute');
    expect(instructions.toLowerCase()).toContain('reading period');
  });
});

describe('Universal YAWP! Tutor layer', () => {
  test('the coaching block opens with the universal block verbatim', () => {
    const block = buildApEnglishLangCoachingBlock();

    expect(block).toContain(UNIVERSAL_TUTOR_BLOCK);
    expect(block.startsWith(UNIVERSAL_TUTOR_BLOCK)).toBe(true);
  });

  test('every built prompt carries the guardrails this course was missing', () => {
    for (const frqType of [
      'synthesis',
      'rhetorical_analysis',
      'argument',
    ] as const) {
      const prompt = buildApEnglishLangCoachInstructions({
        snapshot: snapshotFor(frqType),
      });

      expect(prompt).toContain('You are the YAWP! Tutor');
      expect(prompt).toContain("I'm not that kind of guy!");
      expect(prompt).toContain('I am mysterious and I contain');
      expect(prompt).toContain('MULTILINGUAL.');
      // and still carries the AP Lang substance
      expect(prompt).toContain('AP ENGLISH LANGUAGE');
      expect(prompt).toContain('The rubric is additive');
    }
  });

  test('the universal character comes before the AP Lang specialization', () => {
    const prompt = buildApEnglishLangCoachInstructions({
      snapshot: snapshotFor('synthesis'),
    });

    expect(prompt.indexOf('You are the YAWP! Tutor')).toBeLessThan(
      prompt.indexOf('AP ENGLISH LANGUAGE')
    );
  });
});

describe('Where AP Lang narrows the universal rules', () => {
  test('a modeled example may not be built from the source packet or passage', () => {
    // Principle 5 allows modeling "one possibility" when a student is stuck.
    // On Q1 the student has the sources and on Q2 the passage, so a modeled
    // sentence about those is exactly what they would paste.
    const block = buildApEnglishLangCoachingBlock();

    expect(block).toContain('A MODELED EXAMPLE USES A DIFFERENT TEXT');
    expect(block.indexOf('model one possibility')).toBeLessThan(
      block.indexOf('A MODELED EXAMPLE USES A DIFFERENT TEXT')
    );
  });

  test('turn discipline is one note, not two', () => {
    expect(buildApEnglishLangCoachingBlock()).toContain('ONE NOTE PER TURN');
  });
});

describe('Register mode', () => {
  test('the coaching block declares the register', () => {
    expect(buildApEnglishLangCoachingBlock()).toContain(
      'REGISTER MODE FOR THIS MODULE: POLISHED'
    );
  });

  test('the additive rubric keeps mechanics out of the single note', () => {
    expect(buildApEnglishLangCoachingBlock()).toContain(
      'mechanics are never the one thing you raise'
    );
  });
});

describe('Admin-editable coaching block', () => {
  test('a stored block replaces the authored default', () => {
    const snapshot = snapshotFor('synthesis');
    const prompt = buildApEnglishLangCoachInstructions({
      snapshot,
      coachingBlock: 'EDITED IN ADMIN. Coach tersely.',
    });

    expect(prompt.startsWith('EDITED IN ADMIN.')).toBe(true);
    expect(prompt).not.toContain(UNIVERSAL_TUTOR_BLOCK);
    // The assignment-specific half is still composed from the snapshot.
    expect(prompt).toContain(snapshot.prompt);
  });

  test('a blank stored block falls back to the authored default', () => {
    for (const empty of [undefined, null, '', '   \n ']) {
      const prompt = buildApEnglishLangCoachInstructions({
        snapshot: snapshotFor('argument'),
        coachingBlock: empty,
      });
      expect(prompt.startsWith(UNIVERSAL_TUTOR_BLOCK)).toBe(true);
    }
  });

  test('seeding the authored block produces the identical prompt', () => {
    const snapshot = snapshotFor('rhetorical_analysis');
    expect(
      buildApEnglishLangCoachInstructions({
        snapshot,
        coachingBlock: buildApEnglishLangCoachingBlock(),
      })
    ).toBe(buildApEnglishLangCoachInstructions({ snapshot }));
  });
});
