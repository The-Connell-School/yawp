import { describe, expect, mock, test } from 'bun:test';

mock.module('~/utils/db.server', () => ({ prisma: {} }));

const { buildAssignmentCreateInputFromCustomApHistory } =
  await import('./library.server');
import { parseApHistorySnapshot } from './schema';

describe('buildAssignmentCreateInputFromCustomApHistory', () => {
  test('builds a DBQ assignment with a versioned custom snapshot', () => {
    const input = buildAssignmentCreateInputFromCustomApHistory({
      assignmentTypeId: 'ap-type-1',
      title: 'My Reconstruction DBQ',
      custom: {
        key: 'custom-abc',
        essayType: 'dbq',
        prompt:
          'Evaluate the extent to which Reconstruction was a turning point.',
        period: '1865-1898',
        periodNumber: 6,
        reasoningSkill: 'continuity-and-change',
        timeMode: 'timed',
        durationMinutes: 60,
        sources: [
          {
            position: 1,
            title: 'A Freedmen contract',
            attribution: 'Freedmen’s Bureau, 1866',
            body: 'Terms of a labor contract.',
          },
        ],
      },
    });

    expect(input.title).toBe('My Reconstruction DBQ');
    const snapshot = parseApHistorySnapshot(input.apHistorySnapshot);
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      libraryEntryId: 'custom-abc',
      essayType: 'dbq',
      rubric: { rubricId: 'ap-history-dbq-2026', totalPoints: 7 },
      timing: { mode: 'timed', durationMinutes: 60 },
    });
    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.sources[0].externalKey).toBe('custom-abc-doc-1');
    expect(snapshot.sources[0].mediaType).toBe('text');
  });

  test('drops sources for an LEQ and defaults the title', () => {
    const input = buildAssignmentCreateInputFromCustomApHistory({
      assignmentTypeId: 'ap-type-1',
      title: null,
      custom: {
        key: 'custom-xyz',
        essayType: 'leq',
        prompt: 'Evaluate the causes of the Market Revolution.',
        period: '1815-1848',
        periodNumber: 4,
        reasoningSkill: 'causation',
        timeMode: 'untimed',
        durationMinutes: 40,
        sources: [
          { position: 1, title: 'Ignored', attribution: 'x', body: 'y' },
        ],
      },
    });

    expect(input.title).toBe('Custom LEQ');
    const snapshot = parseApHistorySnapshot(input.apHistorySnapshot);
    expect(snapshot.essayType).toBe('leq');
    expect(snapshot.rubric).toMatchObject({
      rubricId: 'ap-history-leq-2026',
      totalPoints: 6,
    });
    expect(snapshot.sources).toEqual([]);
  });

  test('carries image source metadata into the snapshot', () => {
    const input = buildAssignmentCreateInputFromCustomApHistory({
      assignmentTypeId: 'ap-type-1',
      title: 'Visual DBQ',
      custom: {
        key: 'custom-img',
        essayType: 'dbq',
        prompt: 'Analyze the cartoon.',
        period: '1789-1800',
        periodNumber: 3,
        reasoningSkill: 'causation',
        timeMode: 'untimed',
        durationMinutes: 60,
        sources: [
          {
            position: 1,
            title: 'A political cartoon',
            attribution: 'Anonymous, 1798',
            body: 'Description of the cartoon.',
            mediaType: 'image',
            imageUrl: '/api/image/ap-history-source/custom-img-doc-1',
            imageAlt: 'Two figures fighting',
          },
        ],
      },
    });

    const snapshot = parseApHistorySnapshot(input.apHistorySnapshot);
    expect(snapshot.sources[0]).toMatchObject({
      mediaType: 'image',
      imageUrl: '/api/image/ap-history-source/custom-img-doc-1',
      imageAlt: 'Two figures fighting',
    });
  });
});
