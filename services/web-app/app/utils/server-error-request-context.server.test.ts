import { describe, expect, test } from 'bun:test';
import {
  buildSafeErrorForLog,
  safeDomainErrorTextForClientResponse,
  buildSafeRouteParamsForLog,
  buildSafeStackForLog,
  buildServerErrorRequestContext,
  safeErrorTextForClientResponse,
  safeErrorTextForLog,
  routeTemplateForLog,
  describeNonErrorForLog,
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
      'join failed for teacher@school.edu token=SECRET-TOKEN https://yawp.school/join?code=ABC123'
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
    error.stack =
      'Error: boom\n    at fn (file:///src/route.tsx?secret=1:10:5)';
    expect(buildSafeStackForLog(error)).toBe(
      '    at fn (file:///src/route.tsx:10:5)'
    );
  });

  test('buildSafeStackForLog preserves scoped node_modules paths', () => {
    const error = new Error('fail');
    error.stack = [
      'Error: fail',
      '    at fn (/workspace/node_modules/@react-router/dev/dist/vite.js:123:4)',
      '    at Object.<anonymous> (/workspace/node_modules/@prisma/client/runtime/library.js:112:32)',
    ].join('\n');
    const stack = buildSafeStackForLog(error);
    expect(stack).toContain(
      'node_modules/@react-router/dev/dist/vite.js:123:4'
    );
    expect(stack).toContain(
      'node_modules/@prisma/client/runtime/library.js:112:32'
    );
    expect(stack).not.toContain('***@');
  });

  test('buildSafeErrorForLog for Prisma validation errors omits message and sensitive meta text', () => {
    const error = Object.assign(
      new Error(
        'Invalid `prisma.invitation.create()` invocation for teacher@school.edu token=super-secret /app/route.tsx'
      ),
      {
        name: 'PrismaClientValidationError',
        clientVersion: '6.0.0',
      }
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
        "Can't reach database server at `postgresql://yawp:SECRET-PASS@127.0.0.1:5432/yawp`"
      ),
      { name: 'PrismaClientInitializationError' }
    );
    const serialized = JSON.stringify(buildSafeErrorForLog(error));
    expect(serialized).not.toContain('SECRET-PASS');
    expect(serialized).not.toContain('postgresql://');
  });

  test('safeDomainErrorTextForClientResponse redacts sensitive substrings but keeps validation copy', () => {
    expect(
      safeDomainErrorTextForClientResponse(
        new Error('That prompt is too long to save.'),
        'fallback'
      )
    ).toBe('That prompt is too long to save.');
    const redacted = safeDomainErrorTextForClientResponse(
      new Error(
        'Invalid `prisma.user.findMany()` token=SECRET-TOKEN teacher@school.edu'
      ),
      'Could not complete that request.'
    );
    expect(redacted).not.toContain('SECRET-TOKEN');
    expect(redacted).not.toContain('teacher@school.edu');
  });

  test('safeDomainErrorTextForClientResponse uses fallback when message is empty', () => {
    expect(
      safeDomainErrorTextForClientResponse(
        new Error('   '),
        'Could not complete that request.'
      )
    ).toBe('Could not complete that request.');
  });

  test('safeErrorTextForClientResponse never forwards raw exception text', () => {
    const sensitive =
      'Invalid `prisma.user.findMany()` token=SECRET-TOKEN teacher@school.edu';
    const message = safeErrorTextForClientResponse(
      new Error(sensitive),
      'Something went wrong.'
    );
    expect(message).toBe('Something went wrong.');
    expect(message).not.toContain('prisma');
    expect(message).not.toContain('SECRET-TOKEN');
  });

  test('safeErrorTextForLog returns redacted message text', () => {
    const text = safeErrorTextForLog(
      new Error('delivery failed for teacher@school.edu token=SECRET')
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
      })
    ).toEqual({ paramKeys: ['classId', 'submissionId', 'token'] });
    const serialized = JSON.stringify(
      buildSafeRouteParamsForLog({
        code: 'JOIN-123',
        email: 'teacher@school.edu',
      })
    );
    expect(serialized).not.toContain('JOIN-123');
    expect(serialized).not.toContain('teacher@school.edu');
  });
});

describe('non-Error throws are described, not "[object Object]"', () => {
  test('Response', () => {
    const out = buildSafeErrorForLog(new Response('x', { status: 404 }));
    expect(out).toEqual({ name: 'ThrownResponse', message: 'HTTP 404' });
  });

  test('Promise', () => {
    const p = Promise.resolve(1);
    expect(describeNonErrorForLog(p).name).toBe('ThrownPromise');
  });

  test('ErrorResponse-like object uses status', () => {
    const out = describeNonErrorForLog({
      status: 403,
      statusText: 'Forbidden',
      internal: false,
      data: 'secret teacher@school.edu',
    });
    expect(out.name).toBe('ErrorResponse');
    expect(out.message).toBe('HTTP 403');
    expect(JSON.stringify(out)).not.toContain('teacher@school.edu');
  });

  test('DataWithResponseInit-like object uses init.status', () => {
    class DataWithResponseInit {
      type = 'DataWithResponseInit';
      data = { x: 1 };
      init = { status: 400 };
    }
    const out = describeNonErrorForLog(new DataWithResponseInit());
    expect(out).toEqual({
      name: 'ThrownData',
      message: 'HTTP 400',
      status: 400,
    });
  });

  test('plain object message is redacted', () => {
    const out = describeNonErrorForLog({
      message: 'boom for teacher@school.edu',
    });
    expect(out.message).toContain('boom');
    expect(out.message).not.toContain('teacher@school.edu');
  });

  test('plain object without message lists keys only', () => {
    const out = describeNonErrorForLog({ code: 'X', token: 'SECRET' });
    expect(out.message).toBe('non-Error object (Object) keys: code,token');
    expect(out.message).not.toContain('SECRET');
  });

  test('primitives still stringify', () => {
    expect(describeNonErrorForLog('nope')).toEqual({
      name: 'UnknownError',
      message: 'nope',
    });
  });
});

describe('routeTemplateForLog', () => {
  test('replaces param values with keys and drops query', () => {
    const req = new Request(
      'https://yawp.school/app/classes/ABC123/documents/cmx9?token=SECRET'
    );
    expect(
      routeTemplateForLog(req, { classCode: 'ABC123', documentId: 'cmx9' })
    ).toBe('/app/classes/:classCode/documents/:documentId');
  });

  test('no params keeps path', () => {
    const req = new Request('https://yawp.school/app/my-documents');
    expect(routeTemplateForLog(req, {})).toBe('/app/my-documents');
  });
});
