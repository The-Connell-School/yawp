import { describe, expect, test } from 'bun:test';
import {
  AP_ENGLISH_LANG_ROW_KEYS,
  buildApEnglishLangGradingPrompt,
  buildApEnglishLangGradingSystemPrompt,
  countApEnglishLangEarnedPoints,
  normalizeApEnglishLangRows,
} from './grading';
import { buildApEnglishLangSnapshot } from './schema';

const rhetoricalSnapshot = buildApEnglishLangSnapshot({
  externalKey: 'ap-lang-rhetorical-grade',
  frqType: 'rhetorical_analysis',
  title: 'Rhetorical analysis grade example',
  prompt: "Analyze the rhetorical choices the writer makes.",
  focusSkill: 'rhetorical-situation',
  difficulty: 'exam-ready',
  skillEmphasis: 'evidence-commentary',
  defaultTimeMode: 'timed',
  defaultDurationMinutes: 40,
  suggestedEvidence: null,
  provenanceUrl: null,
  sources: [
    {
      externalKey: 'ap-lang-rhetorical-grade-passage',
      position: 1,
      title: 'The Passage',
      attribution: 'A Writer, 1900',
      body: 'We hold this truth close: the argument matters more than the ornament.',
      caption: null,
      mediaType: 'text',
      imageUrl: null,
      imageAlt: null,
      provenanceUrl: null,
    },
  ],
});

const synthesisSnapshot = buildApEnglishLangSnapshot({
  externalKey: 'ap-lang-synthesis-grade',
  frqType: 'synthesis',
  title: 'Synthesis grade example',
  prompt: 'Argue a position on the issue.',
  focusSkill: 'source-integration',
  difficulty: 'exam-ready',
  skillEmphasis: 'evidence-commentary',
  defaultTimeMode: 'untimed',
  defaultDurationMinutes: 40,
  suggestedEvidence: null,
  provenanceUrl: null,
  sources: [1, 2, 3, 4, 5, 6].map((position) => ({
    externalKey: `ap-lang-synthesis-grade-source-${position}`,
    position,
    title: `Source ${position}`,
    attribution: 'Practice source',
    body: `Body of source ${position}.`,
    caption: null,
    mediaType: position === 6 ? 'image' : 'text',
    imageUrl: position === 6 ? '/img/x.png' : null,
    imageAlt: position === 6 ? 'A chart' : null,
    provenanceUrl: null,
  })),
});

describe('AP English Language grading helpers', () => {
  test('row keys follow the rubric order', () => {
    expect(AP_ENGLISH_LANG_ROW_KEYS).toEqual([
      'thesis',
      'evidence-commentary',
      'sophistication',
    ]);
  });

  test('normalizes and clamps each row to its rubric maximum', () => {
    const rows = normalizeApEnglishLangRows({
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
    const rows = normalizeApEnglishLangRows({ thesis: 'not an object' });
    expect(rows.thesis.pointsEarned).toBe(0);
    expect(rows['evidence-commentary'].pointsEarned).toBe(0);
    expect(rows.sophistication.comment).toBe('');
  });

  test('rounds fractional scores from the model', () => {
    const rows = normalizeApEnglishLangRows({
      'evidence-commentary': { pointsEarned: 2.6, comment: '' },
    });
    expect(rows['evidence-commentary'].pointsEarned).toBe(3);
  });

  test('counts earned points as the clamped sum out of six', () => {
    const rows = normalizeApEnglishLangRows({
      thesis: { pointsEarned: 1 },
      'evidence-commentary': { pointsEarned: 4 },
      sophistication: { pointsEarned: 1 },
    });
    expect(countApEnglishLangEarnedPoints(rows)).toBe(6);
  });

  test('never reports more than the six-point total', () => {
    const rows = {
      thesis: { pointsEarned: 1 },
      'evidence-commentary': { pointsEarned: 4 },
      sophistication: { pointsEarned: 1 },
      bonus: { pointsEarned: 3 },
    };
    expect(countApEnglishLangEarnedPoints(rows)).toBe(6);
  });

  test('system prompt anchors on the rubric and forbids device-only analysis', () => {
    const system = buildApEnglishLangGradingSystemPrompt('Alex');
    expect(system).toContain('Alex,');
    expect(system.toLowerCase()).toContain('line of reasoning');
    expect(system.toLowerCase()).toContain('device');
    expect(system).toContain('ap-english-lang-frq-2019');
  });

  test('user prompt embeds the provided passage for rhetorical analysis', () => {
    const prompt = buildApEnglishLangGradingPrompt({
      snapshot: rhetoricalSnapshot,
      essayText: 'My essay body.',
      studentFirstName: 'Alex',
    });
    expect(prompt).toContain(
      'We hold this truth close: the argument matters more than the ornament.',
    );
    expect(prompt).toContain('My essay body.');
  });

  test('user prompt embeds every synthesis source and the source-count rule', () => {
    const prompt = buildApEnglishLangGradingPrompt({
      snapshot: synthesisSnapshot,
      essayText: 'Body.',
      studentFirstName: 'Sam',
    });
    for (const position of [1, 2, 3, 4, 5, 6]) {
      expect(prompt).toContain(`Body of source ${position}.`);
    }
    expect(prompt.toLowerCase()).toContain('source-count rule');
  });

  test('user prompt guards against invented evidence for the open argument question', () => {
    const argumentSnapshot = buildApEnglishLangSnapshot({
      externalKey: 'ap-lang-argument-grade',
      frqType: 'argument',
      title: 'Argument grade example',
      prompt: 'Take a position on disagreement.',
      focusSkill: 'line-of-reasoning',
      difficulty: 'exam-ready',
      skillEmphasis: 'sophistication',
      defaultTimeMode: 'untimed',
      defaultDurationMinutes: 40,
      suggestedEvidence: 'The Civil Rights Movement',
      provenanceUrl: null,
      sources: [],
    });
    const prompt = buildApEnglishLangGradingPrompt({
      snapshot: argumentSnapshot,
      essayText: 'Body.',
      studentFirstName: 'Sam',
    });
    expect(prompt.toLowerCase()).toContain('no provided text');
  });
});
