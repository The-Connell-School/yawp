import { describe, expect, test } from 'bun:test';
import {
  AP_ENGLISH_LANG_COACH_PRINCIPLES,
  buildApEnglishLangCoachInstructions,
} from './coach';
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
