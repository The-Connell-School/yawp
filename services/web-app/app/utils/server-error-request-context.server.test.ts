import { describe, expect, test } from 'bun:test';
import {
  buildSafeErrorForLog,
  buildSafeRouteParamsForLog,
  buildSafeStackForLog,
  buildServerErrorRequestContext,
  safeErrorTextForClientResponse,
  safeErrorTextForLog,
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

  test('buildSafeErrorForLog redacts freeform messages and keeps sanitized stack frames', () => {
    const error = new Error(
      'join failed for teacher@school.edu token=SECRET-TOKEN https://yawp.school/join?code=ABC123',
    );
    error.stack =
      'Error: join failed\n    at handler (file:///app/join:10:5)\n    at Object.run (file:///yawp.school/path:20:1)';
    const safe = buildSafeErrorForLog(error);
    expect(safe.name).toBe('Error');
    expect('message' in safe && safe.message).toContain('join failed');
    expect(JSON.stringify(safe)).not.toContain('teacher@school.edu');
    expect(JSON.stringify(safe)).not.toContain('SECRET-TOKEN');
    expect(JSON.stringify(safe)).not.toContain('ABC123');
    expect(safe.stack).toContain('at handler');
    expect(safe.stack).not.toMatch(/^Error:/m);
  });

  test('buildSafeStackForLog drops message continuations that start with "at " but lack line:col', () => {
    const error = new Error('failed');
    error.stack = [
      'Error: failed',
      '    at attacker@evil.com token=xyz',
      '    at realFn (/src/app.tsx:10:5)',
    ].join('\n');
    const safe = buildSafeErrorForLog(error);
    const serialized = JSON.stringify(safe);
    expect(serialized).not.toContain('attacker@evil.com');
    expect(serialized).not.toContain('token=xyz');
    expect(safe.stack).toContain('realFn');
    expect(safe.stack).toContain(':10:5');
  });

  test('buildSafeStackForLog strips query strings from frame paths', () => {
    const error = new Error('boom');
    error.stack = 'Error: boom\n    at fn (file:///src/route.tsx?secret=1:10:5)';
    expect(buildSafeStackForLog(error)).toBe(
      '    at fn (file:///src/route.tsx:10:5)',
    );
  });

  test('buildSafeErrorForLog for Prisma validation errors omits message and sensitive meta text', () => {
    const error = Object.assign(
      new Error(
        'Invalid `prisma.invitation.create()` invocation for teacher@school.edu token=super-secret /app/route.tsx',
      ),
      {
        name: 'PrismaClientValidationError',
        clientVersion: '6.0.0',
      },
    );
    error.stack =
      'PrismaClientValidationError: Invalid invocation\n    at /workspace/services/web-app/app/route.tsx:12:3';
    const safe = buildSafeErrorForLog(error);
    expect(safe).toEqual({
      name: 'PrismaClientValidationError',
      stack: '    at /workspace/services/web-app/app/route.tsx:12:3',
    });
    expect(JSON.stringify(safe)).not.toContain('teacher@school.edu');
    expect(JSON.stringify(safe)).not.toContain('super-secret');
    expect(JSON.stringify(safe)).not.toContain('message');
  });

  test('buildSafeErrorForLog for Prisma known request errors keeps code and meta', () => {
    const error = Object.assign(new Error('Unique constraint failed'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { modelName: 'Invitation', target: ['target'] },
    });
    expect(buildSafeErrorForLog(error)).toMatchObject({
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      modelName: 'Invitation',
      target: ['target'],
    });
  });

  test('buildSafeErrorForLog redacts prisma initialization connection strings', () => {
    const error = Object.assign(
      new Error(
        "Can't reach database server at `postgresql://yawp:SECRET-PASS@127.0.0.1:5432/yawp`",
      ),
      { name: 'PrismaClientInitializationError' },
    );
    const serialized = JSON.stringify(buildSafeErrorForLog(error));
    expect(serialized).not.toContain('SECRET-PASS');
    expect(serialized).not.toContain('postgresql://');
  });

  test('safeErrorTextForClientResponse never forwards raw exception text', () => {
    const sensitive =
      'Invalid `prisma.user.findMany()` token=SECRET-TOKEN teacher@school.edu';
    const message = safeErrorTextForClientResponse(
      new Error(sensitive),
      'Something went wrong.',
    );
    expect(message).toBe('Something went wrong.');
    expect(message).not.toContain('prisma');
    expect(message).not.toContain('SECRET-TOKEN');
  });

  test('safeErrorTextForLog returns redacted message text', () => {
    const text = safeErrorTextForLog(
      new Error('delivery failed for teacher@school.edu token=SECRET'),
    );
    expect(text).toContain('delivery failed');
    expect(text).not.toContain('teacher@school.edu');
    expect(text).not.toContain('SECRET');
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
