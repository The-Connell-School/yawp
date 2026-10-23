import { describe, expect, mock, test } from 'bun:test';

mock.module('./utils/auth.server', () => ({
  getUserId: async () => 'user-test-id',
}));

mock.module('./services/posthog.server', () => ({
  posthog: null,
}));

const { handleError } = await import('./entry.server');

describe('handleError logging', () => {
  test('logs safe error context without raw route params or stacks', async () => {
    const errorLog = mock((..._args: unknown[]) => {});
    const log = mock((..._args: unknown[]) => {});
    const originalError = console.error;
    const originalLog = console.log;
    console.error = errorLog as typeof console.error;
    console.log = log as typeof console.log;
    try {
      const request = new Request('https://example.test/join/ABC123?token=secret', {
        method: 'GET',
        headers: { cookie: 'session=secret' },
      });
      const routeError = new Error('class join failed');
      routeError.stack = 'Error: class join failed\n    at /join/SECRET-CODE';

      await handleError(routeError, {
        request,
        params: {
          classId: 'class-secret-id',
          code: 'JOIN-CODE-123',
        },
        context: {},
      });

      const serialized = [
        ...log.mock.calls,
        ...errorLog.mock.calls,
      ]
        .map((call) => JSON.stringify(call))
        .join(' ');

      expect(serialized).toContain('Server Error Details');
      expect(serialized).not.toContain('class-secret-id');
      expect(serialized).not.toContain('JOIN-CODE-123');
      expect(serialized).not.toContain('SECRET-CODE');
      expect(serialized).toContain('paramKeys');
    } finally {
      console.error = originalError;
      console.log = originalLog;
    }
  });
});
