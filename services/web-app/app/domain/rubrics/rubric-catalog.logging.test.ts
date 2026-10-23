import { describe, expect, mock, test } from 'bun:test';
import { RubricCatalog } from './rubric-catalog.server';

describe('rubric catalog logging', () => {
  test('clearRelease logs a redacted actor email', async () => {
    const infoLog = mock((..._args: unknown[]) => {});
    const originalInfo = console.info;
    console.info = infoLog as typeof console.info;
    try {
      const previous = {
        rubricRevisionId: 'rev-1',
        releasedAt: new Date('2026-01-01T00:00:00.000Z'),
        rubricRevision: { version: 2, fingerprint: 'abc' },
      };
      const catalog = new RubricCatalog({
        $transaction: async (fn) =>
          fn({
            rubricRelease: {
              findUnique: async () => previous,
              delete: async () => {},
            },
          }),
      } as any);

      await catalog.clearRelease({
        key: 'daily-pages-engagement',
        actorEmail: 'staff@secret.edu',
        reason: 'Roll back release',
      });

      const serialized = JSON.stringify(infoLog.mock.calls);
      expect(serialized).toContain('rubric_release_cleared');
      expect(serialized).not.toContain('staff@secret.edu');
      expect(serialized).toContain('s***@s***');
    } finally {
      console.info = originalInfo;
    }
  });
});
