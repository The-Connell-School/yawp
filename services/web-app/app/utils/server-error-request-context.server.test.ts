import { describe, expect, test } from 'bun:test';
import {
  buildSafeErrorForLog,
  buildSafeRouteParamsForLog,
  buildServerErrorRequestContext,
} from './server-error-request-context.server';

describe('buildServerErrorRequestContext', () => {
  test('logs method, path without query string, request id, and allow-listed headers only', () => {
    const request = new Request('https://example.test/app/classes?secret=1', {
      method: 'POST',
      headers: {
        cookie: 'session=super-secret',
        authorization: 'Bearer token-value',
        'x-forwarded-for': '203.0.113.1',
        'set-cookie': 'other=bad',
        'user-agent': 'test-agent/1.0',
        'x-request-id': 'req-abc-123',
      },
    });

    expect(buildServerErrorRequestContext(request)).toEqual({
      method: 'POST',
      path: '/app/classes',
      requestId: 'req-abc-123',
      headers: {
        'user-agent': 'test-agent/1.0',
        'x-request-id': 'req-abc-123',
      },
    });
  });

  test('buildSafeErrorForLog omits stack traces', () => {
    const error = new Error('join failed for class ABC123');
    error.stack = 'Error: join failed\n    at https://yawp.school/join?code=SECRET';
    expect(buildSafeErrorForLog(error)).toEqual({
      name: 'Error',
      message: 'join failed for class ABC123',
    });
    expect(JSON.stringify(buildSafeErrorForLog(error))).not.toContain('SECRET');
    expect(JSON.stringify(buildSafeErrorForLog(error))).not.toContain('stack');
  });

  test('buildSafeRouteParamsForLog lists keys without values', () => {
    expect(
      buildSafeRouteParamsForLog({
        classId: 'class-secret',
        token: 'raw-token',
        submissionId: 'sub-1',
      }),
    ).toEqual({ paramKeys: ['classId', 'submissionId', 'token'] });
    const serialized = JSON.stringify(
      buildSafeRouteParamsForLog({ code: 'JOIN-123', email: 'teacher@school.edu' }),
    );
    expect(serialized).not.toContain('JOIN-123');
    expect(serialized).not.toContain('teacher@school.edu');
  });
});
