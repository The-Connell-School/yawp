import { describe, expect, test } from 'bun:test';
import {
  AP_HISTORY_ASSIGNMENT_TYPE_KEY,
  buildApHistorySnapshot,
  parseApHistorySnapshot,
} from './schema';

type LibraryEntryFixture = {
  externalKey: string;
  course: string;
  essayType: string;
  title: string;
  prompt: string;
  period: string;
  periodNumber: number;
  reasoningSkill: string;
  difficulty: string;
  skillEmphasis: string;
  defaultTimeMode: string;
  defaultDurationMinutes: number;
  provenanceUrl: string;
  sources: Array<{
    externalKey: string;
    position: number;
    title: string;
    attribution: string;
    body: string;
    caption: string | null;
    mediaType: 'text' | 'image';
    imageUrl: string | null;
    imageAlt: string | null;
    provenanceUrl: string | null;
  }>;
};

const dbqEntry: LibraryEntryFixture = {
  externalKey: 'apush-dbq-new-deal-federal-power',
  course: 'apush',
  essayType: 'dbq',
  title: 'New Deal and Federal Power DBQ',
  prompt:
    'Evaluate the extent to which the New Deal changed the role of the federal government.',
  period: '1932-1980',
  periodNumber: 7,
  reasoningSkill: 'causation',
  difficulty: 'exam-ready',
  skillEmphasis: 'evidence',
  defaultTimeMode: 'untimed',
  defaultDurationMinutes: 60,
  provenanceUrl: 'https://example.test/new-deal-dbq',
  sources: [
    {
      externalKey: 'apush-dbq-new-deal-federal-power-doc-1',
      position: 1,
      title: 'Document 1',
      attribution: 'Franklin D. Roosevelt, fireside chat, 1933',
      body: 'The only thing we have to fear is fear itself.',
      caption: 'FDR addresses the banking crisis.',
      mediaType: 'text',
      imageUrl: null,
      imageAlt: null,
      provenanceUrl: 'https://example.test/doc-1',
    },
  ],
};

describe('AP History snapshot schema', () => {
  test('exports the canonical assignment type key', () => {
    expect(AP_HISTORY_ASSIGNMENT_TYPE_KEY).toBe('ap_history_essay');
  });

  test('builds a versioned immutable DBQ snapshot from a library row', () => {
    const snapshot = buildApHistorySnapshot(dbqEntry);
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      libraryEntryId: 'apush-dbq-new-deal-federal-power',
      course: 'apush',
      essayType: 'dbq',
      prompt: dbqEntry.prompt,
      rubric: { rubricId: 'ap-history-dbq-2026', totalPoints: 7 },
      timing: { mode: 'untimed', durationMinutes: 60 },
    });
    expect(snapshot.sources).toHaveLength(1);

    dbqEntry.sources[0].body = 'Library row changed after assignment creation.';
    expect(snapshot.sources[0].body).toBe(
      'The only thing we have to fear is fear itself.'
    );
  });

  test('accepts LEQ snapshots with no sources', () => {
    const snapshot = buildApHistorySnapshot({
      ...dbqEntry,
      externalKey: 'apush-leq-market-revolution',
      essayType: 'leq',
      defaultDurationMinutes: 40,
      sources: [],
    });

    expect(parseApHistorySnapshot(snapshot)).toMatchObject({
      essayType: 'leq',
      rubric: { rubricId: 'ap-history-leq-2026', totalPoints: 6 },
      sources: [],
    });
  });

  test('rejects DBQ snapshots with the LEQ rubric contract', () => {
    const snapshot = buildApHistorySnapshot(dbqEntry);

    expect(() =>
      parseApHistorySnapshot({
        ...snapshot,
        rubric: { rubricId: 'ap-history-leq-2026', totalPoints: 6 },
      })
    ).toThrow();
  });

  test('rejects LEQ snapshots with the DBQ rubric contract', () => {
    const snapshot = buildApHistorySnapshot({
      ...dbqEntry,
      externalKey: 'apush-leq-market-revolution',
      essayType: 'leq',
      defaultDurationMinutes: 40,
      sources: [],
    });

    expect(() =>
      parseApHistorySnapshot({
        ...snapshot,
        rubric: { rubricId: 'ap-history-dbq-2026', totalPoints: 7 },
      })
    ).toThrow();
  });

  test('rejects non-APUSH library rows instead of coercing the course', () => {
    expect(() =>
      buildApHistorySnapshot({
        ...dbqEntry,
        course: 'ap-world',
      })
    ).toThrow();
  });

  test('rejects source snapshots with an invalid media type', () => {
    expect(() =>
      buildApHistorySnapshot({
        ...dbqEntry,
        sources: [
          {
            ...dbqEntry.sources[0],
            mediaType: 'video',
          },
        ],
      })
    ).toThrow();
  });
});
