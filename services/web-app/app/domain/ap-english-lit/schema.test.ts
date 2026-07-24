import { describe, expect, test } from 'bun:test';
import {
  AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY,
  buildApEnglishLitSnapshot,
  isApEnglishLitSnapshot,
  parseApEnglishLitSnapshot,
} from './schema';

type LibraryEntryFixture = Parameters<typeof buildApEnglishLitSnapshot>[0];

const poetryEntry: LibraryEntryFixture = {
  externalKey: 'ap-lit-poetry-frost-acquainted',
  frqType: 'poetry',
  title: 'Acquainted with the Night — Poetry Analysis',
  prompt:
    "Read the following poem carefully. Then, in a well-written essay, analyze how the poet uses literary techniques to convey the speaker's complex relationship with solitude.",
  focusSkill: 'speaker-attitude',
  difficulty: 'exam-ready',
  skillEmphasis: 'evidence-commentary',
  defaultTimeMode: 'untimed',
  defaultDurationMinutes: 40,
  suggestedWorks: null,
  provenanceUrl: 'https://apcentral.collegeboard.org/',
  sources: [
    {
      externalKey: 'ap-lit-poetry-frost-acquainted-poem',
      position: 1,
      title: 'Acquainted with the Night',
      attribution: 'Robert Frost, 1928',
      body: 'I have been one acquainted with the night.\nI have walked out in rain — and back in rain.',
      caption: null,
      mediaType: 'text',
      imageUrl: null,
      imageAlt: null,
      provenanceUrl: null,
    },
  ],
};

const literaryArgumentEntry: LibraryEntryFixture = {
  externalKey: 'ap-lit-argument-moral-ambiguity',
  frqType: 'literary_argument',
  title: 'Moral Ambiguity — Literary Argument',
  prompt:
    'Select a novel or play in which a character is morally ambiguous. Then, in a well-written essay, analyze how the character\'s moral ambiguity contributes to an interpretation of the work as a whole.',
  focusSkill: 'moral-ambiguity',
  difficulty: 'exam-ready',
  skillEmphasis: 'sophistication',
  defaultTimeMode: 'untimed',
  defaultDurationMinutes: 40,
  suggestedWorks: 'Crime and Punishment\nBeloved\nHamlet',
  provenanceUrl: 'https://apcentral.collegeboard.org/',
  sources: [],
};

describe('AP English Literature snapshot schema', () => {
  test('exports the canonical assignment type key', () => {
    expect(AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY).toBe('ap_english_lit_essay');
  });

  test('builds a versioned poetry snapshot from a library row', () => {
    const snapshot = buildApEnglishLitSnapshot(poetryEntry);
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      libraryEntryId: 'ap-lit-poetry-frost-acquainted',
      frqType: 'poetry',
      prompt: poetryEntry.prompt,
      rubric: { rubricId: 'ap-english-lit-frq-2019', totalPoints: 6 },
      timing: { mode: 'untimed', durationMinutes: 40 },
    });
    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.suggestedWorks).toEqual([]);
  });

  test('snapshots are immutable copies of the library row', () => {
    const snapshot = buildApEnglishLitSnapshot(poetryEntry);
    poetryEntry.sources[0].body = 'Library row changed after assignment creation.';
    expect(snapshot.sources[0].body).toBe(
      'I have been one acquainted with the night.\nI have walked out in rain — and back in rain.',
    );
    // Restore fixture for other tests.
    poetryEntry.sources[0].body =
      'I have been one acquainted with the night.\nI have walked out in rain — and back in rain.';
  });

  test('builds a literary argument snapshot with no sources and suggested works', () => {
    const snapshot = buildApEnglishLitSnapshot(literaryArgumentEntry);
    expect(parseApEnglishLitSnapshot(snapshot)).toMatchObject({
      frqType: 'literary_argument',
      rubric: { rubricId: 'ap-english-lit-frq-2019', totalPoints: 6 },
      sources: [],
      suggestedWorks: ['Crime and Punishment', 'Beloved', 'Hamlet'],
    });
  });

  test('every frq type shares the single 6-point analytic rubric', () => {
    for (const frqType of ['poetry', 'prose', 'literary_argument'] as const) {
      const snapshot = buildApEnglishLitSnapshot({
        ...poetryEntry,
        externalKey: `ap-lit-${frqType}-example`,
        frqType,
        sources: frqType === 'literary_argument' ? [] : poetryEntry.sources,
      });
      expect(snapshot.rubric).toEqual({
        rubricId: 'ap-english-lit-frq-2019',
        totalPoints: 6,
      });
    }
  });

  test('requires a provided text for poetry and prose analysis', () => {
    expect(() =>
      buildApEnglishLitSnapshot({
        ...poetryEntry,
        externalKey: 'ap-lit-poetry-missing-text',
        sources: [],
      }),
    ).toThrow();
  });

  test('rejects a literary argument that ships a provided text', () => {
    expect(() =>
      buildApEnglishLitSnapshot({
        ...literaryArgumentEntry,
        externalKey: 'ap-lit-argument-with-text',
        sources: poetryEntry.sources,
      }),
    ).toThrow();
  });

  test('rejects an unknown frq type instead of coercing it', () => {
    expect(() =>
      buildApEnglishLitSnapshot({
        ...poetryEntry,
        frqType: 'drama_analysis',
      }),
    ).toThrow();
  });

  test('rejects a snapshot whose rubric total is not 6 points', () => {
    const snapshot = buildApEnglishLitSnapshot(poetryEntry);
    expect(() =>
      parseApEnglishLitSnapshot({
        ...snapshot,
        rubric: { rubricId: 'ap-english-lit-frq-2019', totalPoints: 7 },
      }),
    ).toThrow();
  });

  test('rejects source snapshots with an invalid media type', () => {
    expect(() =>
      buildApEnglishLitSnapshot({
        ...poetryEntry,
        sources: [{ ...poetryEntry.sources[0], mediaType: 'video' }],
      }),
    ).toThrow();
  });

  test('isApEnglishLitSnapshot type guard reflects validity', () => {
    const snapshot = buildApEnglishLitSnapshot(poetryEntry);
    expect(isApEnglishLitSnapshot(snapshot)).toBe(true);
    expect(isApEnglishLitSnapshot({ frqType: 'poetry' })).toBe(false);
  });
});
