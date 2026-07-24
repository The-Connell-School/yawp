import { describe, expect, test } from 'bun:test';
import {
  AP_ENGLISH_LIT_ROW_KEYS,
  buildApEnglishLitGradingPrompt,
  buildApEnglishLitGradingSystemPrompt,
  countApEnglishLitEarnedPoints,
  normalizeApEnglishLitRows,
} from './grading';
import { buildApEnglishLitSnapshot } from './schema';

const poetrySnapshot = buildApEnglishLitSnapshot({
  externalKey: 'ap-lit-poetry-grade',
  frqType: 'poetry',
  title: 'Poetry grade example',
  prompt: 'Analyze how the poet conveys the speaker\'s attitude.',
  focusSkill: 'speaker-attitude',
  difficulty: 'exam-ready',
  skillEmphasis: 'evidence-commentary',
  defaultTimeMode: 'timed',
  defaultDurationMinutes: 40,
  suggestedWorks: null,
  provenanceUrl: null,
  sources: [
    {
      externalKey: 'ap-lit-poetry-grade-poem',
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

describe('AP English Literature grading helpers', () => {
  test('row keys follow the rubric order', () => {
    expect(AP_ENGLISH_LIT_ROW_KEYS).toEqual([
      'thesis',
      'evidence-commentary',
      'sophistication',
    ]);
  });

  test('normalizes and clamps each row to its rubric maximum', () => {
    const rows = normalizeApEnglishLitRows({
      thesis: { pointsEarned: 5, comment: 'over cap' },
      'evidence-commentary': { pointsEarned: 3, comment: 'solid reasoning' },
      sophistication: { pointsEarned: -2, comment: 'below floor' },
    });
    expect(rows.thesis.pointsEarned).toBe(1);
    expect(rows.thesis.pointsPossible).toBe(1);
    expect(rows['evidence-commentary'].pointsEarned).toBe(3);
    expect(rows.sophistication.pointsEarned).toBe(0);
  });

  test('fills missing or malformed rows with zeros', () => {
    const rows = normalizeApEnglishLitRows({ thesis: 'not an object' });
    expect(rows.thesis.pointsEarned).toBe(0);
    expect(rows['evidence-commentary'].pointsEarned).toBe(0);
    expect(rows.sophistication.comment).toBe('');
  });

  test('rounds fractional scores from the model', () => {
    const rows = normalizeApEnglishLitRows({
      'evidence-commentary': { pointsEarned: 2.6, comment: '' },
    });
    expect(rows['evidence-commentary'].pointsEarned).toBe(3);
  });

  test('counts earned points as the clamped sum out of six', () => {
    const rows = normalizeApEnglishLitRows({
      thesis: { pointsEarned: 1 },
      'evidence-commentary': { pointsEarned: 4 },
      sophistication: { pointsEarned: 1 },
    });
    expect(countApEnglishLitEarnedPoints(rows)).toBe(6);
  });

  test('never reports more than the six-point total', () => {
    const rows = {
      thesis: { pointsEarned: 1 },
      'evidence-commentary': { pointsEarned: 4 },
      sophistication: { pointsEarned: 1 },
      // A stray extra row should not inflate the total.
      bonus: { pointsEarned: 3 },
    };
    expect(countApEnglishLitEarnedPoints(rows)).toBe(6);
  });

  test('system prompt anchors on the rubric and forbids fake sophistication', () => {
    const system = buildApEnglishLitGradingSystemPrompt('Alex');
    expect(system).toContain('Alex,');
    expect(system.toLowerCase()).toContain('line of reasoning');
    expect(system.toLowerCase()).toContain('ornate vocabulary');
    expect(system).toContain('ap-english-lit-frq-2019');
  });

  test('user prompt embeds the provided text for poetry', () => {
    const prompt = buildApEnglishLitGradingPrompt({
      snapshot: poetrySnapshot,
      essayText: 'My essay body.',
      studentFirstName: 'Alex',
    });
    expect(prompt).toContain('Time, that old gardener, prunes us all.');
    expect(prompt).toContain('My essay body.');
  });

  test('user prompt guards against invented plot for the open question', () => {
    const argumentSnapshot = buildApEnglishLitSnapshot({
      externalKey: 'ap-lit-argument-grade',
      frqType: 'literary_argument',
      title: 'Argument grade example',
      prompt: 'Analyze a morally ambiguous character.',
      focusSkill: 'moral-ambiguity',
      difficulty: 'exam-ready',
      skillEmphasis: 'sophistication',
      defaultTimeMode: 'untimed',
      defaultDurationMinutes: 40,
      suggestedWorks: 'Hamlet',
      provenanceUrl: null,
      sources: [],
    });
    const prompt = buildApEnglishLitGradingPrompt({
      snapshot: argumentSnapshot,
      essayText: 'Body.',
      studentFirstName: 'Sam',
    });
    expect(prompt.toLowerCase()).toContain('do not invent plot');
  });
});
