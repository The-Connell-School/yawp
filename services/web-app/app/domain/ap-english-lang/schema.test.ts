import { describe, expect, test } from 'bun:test';
import {
  AP_ENGLISH_LANG_RUBRIC_ID,
  AP_ENGLISH_LANG_RUBRIC_TOTAL_POINTS,
} from './rubric';
import {
  AP_ENGLISH_LANG_SNAPSHOT_VERSION,
  buildApEnglishLangSnapshot,
  isApEnglishLangSnapshot,
  parseApEnglishLangSnapshot,
  parseSuggestedEvidence,
} from './schema';

function synthesisEntry(overrides: Record<string, unknown> = {}) {
  return {
    externalKey: 'ap-lang-synthesis-demo',
    frqType: 'synthesis',
    title: 'Demo Synthesis',
    prompt: 'Take a position on the question.',
    focusSkill: 'source-integration',
    difficulty: 'exam-ready',
    skillEmphasis: 'evidence-commentary',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: [1, 2, 3, 4, 5, 6].map((position) => ({
      externalKey: `ap-lang-synthesis-demo-source-${position}`,
      position,
      title: `Source ${position}`,
      attribution: 'Practice source',
      body: 'Body text.',
      caption: null,
      mediaType: position === 6 ? 'image' : 'text',
      imageUrl: position === 6 ? '/img/x.png' : null,
      imageAlt: position === 6 ? 'A chart' : null,
      provenanceUrl: null,
    })),
    ...overrides,
  };
}

function rhetoricalEntry(overrides: Record<string, unknown> = {}) {
  return {
    ...synthesisEntry(),
    externalKey: 'ap-lang-rhetorical-demo',
    frqType: 'rhetorical_analysis',
    sources: [
      {
        externalKey: 'ap-lang-rhetorical-demo-passage',
        position: 1,
        title: 'A Speech',
        attribution: 'Someone, 1863 (public domain)',
        body: 'Four score and seven years ago...',
        caption: null,
        mediaType: 'text',
        imageUrl: null,
        imageAlt: null,
        provenanceUrl: null,
      },
    ],
    ...overrides,
  };
}

function argumentEntry(overrides: Record<string, unknown> = {}) {
  return {
    ...synthesisEntry(),
    externalKey: 'ap-lang-argument-demo',
    frqType: 'argument',
    sources: [],
    suggestedEvidence: 'The Civil Rights Movement\nThe Industrial Revolution',
    ...overrides,
  };
}

describe('buildApEnglishLangSnapshot', () => {
  test('builds a valid synthesis snapshot', () => {
    const snapshot = buildApEnglishLangSnapshot(synthesisEntry());

    expect(snapshot.schemaVersion).toBe(AP_ENGLISH_LANG_SNAPSHOT_VERSION);
    expect(snapshot.frqType).toBe('synthesis');
    expect(snapshot.libraryEntryId).toBe('ap-lang-synthesis-demo');
    expect(snapshot.sources).toHaveLength(6);
    expect(snapshot.rubric.rubricId).toBe(AP_ENGLISH_LANG_RUBRIC_ID);
    expect(snapshot.rubric.totalPoints).toBe(AP_ENGLISH_LANG_RUBRIC_TOTAL_POINTS);
    expect(snapshot.timing.durationMinutes).toBe(40);
  });

  test('builds a valid rhetorical analysis snapshot with one passage', () => {
    const snapshot = buildApEnglishLangSnapshot(rhetoricalEntry());
    expect(snapshot.frqType).toBe('rhetorical_analysis');
    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.suggestedEvidence).toEqual([]);
  });

  test('builds a valid argument snapshot with no provided text', () => {
    const snapshot = buildApEnglishLangSnapshot(argumentEntry());
    expect(snapshot.frqType).toBe('argument');
    expect(snapshot.sources).toEqual([]);
    expect(snapshot.suggestedEvidence).toEqual([
      'The Civil Rights Movement',
      'The Industrial Revolution',
    ]);
  });

  test('deep copies sources so later library edits cannot mutate the snapshot', () => {
    const entry = rhetoricalEntry();
    const snapshot = buildApEnglishLangSnapshot(entry);
    entry.sources[0].body = 'MUTATED';
    expect(snapshot.sources[0].body).toBe('Four score and seven years ago...');
  });

  test('rejects a synthesis prompt with fewer than three sources', () => {
    const entry = synthesisEntry({
      sources: synthesisEntry().sources.slice(0, 2),
    });
    expect(() => buildApEnglishLangSnapshot(entry)).toThrow();
  });

  test('rejects a synthesis prompt with no visual source', () => {
    const sources = synthesisEntry().sources.map((source) => ({
      ...source,
      mediaType: 'text',
      imageUrl: null,
      imageAlt: null,
    }));
    expect(() => buildApEnglishLangSnapshot(synthesisEntry({ sources }))).toThrow();
  });

  test('rejects a rhetorical analysis prompt with no passage', () => {
    expect(() =>
      buildApEnglishLangSnapshot(rhetoricalEntry({ sources: [] })),
    ).toThrow();
  });

  test('rejects a rhetorical analysis prompt with more than one passage', () => {
    const entry = rhetoricalEntry({ sources: synthesisEntry().sources });
    expect(() => buildApEnglishLangSnapshot(entry)).toThrow();
  });

  test('rejects an argument prompt that ships a provided text', () => {
    const entry = argumentEntry({ sources: rhetoricalEntry().sources });
    expect(() => buildApEnglishLangSnapshot(entry)).toThrow();
  });

  test('rejects an unknown FRQ type', () => {
    expect(() =>
      buildApEnglishLangSnapshot(synthesisEntry({ frqType: 'poetry' })),
    ).toThrow();
  });
});

describe('snapshot parsing helpers', () => {
  test('parseApEnglishLangSnapshot round-trips a built snapshot', () => {
    const snapshot = buildApEnglishLangSnapshot(argumentEntry());
    expect(parseApEnglishLangSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(
      snapshot,
    );
  });

  test('isApEnglishLangSnapshot guards unknown values', () => {
    expect(isApEnglishLangSnapshot(buildApEnglishLangSnapshot(argumentEntry()))).toBe(
      true,
    );
    expect(isApEnglishLangSnapshot({ schemaVersion: 1 })).toBe(false);
    expect(isApEnglishLangSnapshot(null)).toBe(false);
  });
});

describe('parseSuggestedEvidence', () => {
  test('splits newline-separated entries and trims them', () => {
    expect(parseSuggestedEvidence('  a  \n\n b \n')).toEqual(['a', 'b']);
  });

  test('returns an empty array for null or empty input', () => {
    expect(parseSuggestedEvidence(null)).toEqual([]);
    expect(parseSuggestedEvidence('')).toEqual([]);
    expect(parseSuggestedEvidence(undefined)).toEqual([]);
  });
});
