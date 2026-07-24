import { describe, expect, test } from 'bun:test';
import {
  AP_ENGLISH_LIT_COACH_PRINCIPLES,
  buildApEnglishLitCoachInstructions,
} from './coach';
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
