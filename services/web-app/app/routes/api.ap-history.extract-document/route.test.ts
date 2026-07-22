import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findFirst: mock() },
  assignmentType: { findFirst: mock() },
};
const requireUserId = mock();
const requireMembership = mock();
const requireMutableRequest = mock();
const reserveAiRequest = mock();
const isAssignmentTypeAvailableForEveryScope = mock();
const extractApHistoryPdf = mock();
const isApHistoryPdfImportEnabled = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
  requireMutableRequest,
}));
mock.module('~/utils/ai-admission.server', () => ({
  reserveAiRequest,
  AiRateLimitError: class AiRateLimitError extends Error {
    retryAfterSeconds: number;
    constructor(retryAfterSeconds: number) {
      super('rate limited');
      this.retryAfterSeconds = retryAfterSeconds;
    }
  },
}));
mock.module('~/utils/assignment-type-access.server', () => ({
  isAssignmentTypeAvailableForEveryScope,
}));
mock.module('~/domain/ap-history/pdf-extraction.server', () => ({
  extractApHistoryPdf,
}));
mock.module('~/domain/ap-history/pdf-import-flag.server', () => ({
  isApHistoryPdfImportEnabled,
}));

const { action } = await import('./route');
const { AiRateLimitError } = await import('~/utils/ai-admission.server');

function requestFor({
  file = new File(
    [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])],
    'pilot-dbq.pdf',
    { type: 'application/pdf' },
  ),
  classId = 'class-1',
  assignmentTypeId = 'ap-type-1',
}: {
  file?: File;
  classId?: string;
  assignmentTypeId?: string;
} = {}) {
  const form = new FormData();
  form.set('classId', classId);
  form.set('assignmentTypeId', assignmentTypeId);
  form.set('file', file);
  return new Request('https://example.test/api/ap-history/extract-document', {
    method: 'POST',
    body: form,
  });
}

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

function responseStatus(response: any) {
  return response.status ?? response.init?.status;
}

describe('api.ap-history.extract-document', () => {
  beforeEach(() => {
    for (const fn of [
      prisma.class.findFirst,
      prisma.assignmentType.findFirst,
      requireUserId,
      requireMembership,
      requireMutableRequest,
      reserveAiRequest,
      isAssignmentTypeAvailableForEveryScope,
      extractApHistoryPdf,
      isApHistoryPdfImportEnabled,
    ]) {
      fn.mockReset();
    }

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1' },
    });
    requireMutableRequest.mockResolvedValue(undefined);
    prisma.class.findFirst.mockResolvedValue({
      id: 'class-1',
      school: {
        id: 'school-1',
        organizationId: 'org-1',
        organization: { apHistoryPdfImportEnabled: true },
      },
    });
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'ap-type-1',
      systemKey: 'ap_history_essay',
    });
    isAssignmentTypeAvailableForEveryScope.mockResolvedValue(true);
    isApHistoryPdfImportEnabled.mockReturnValue(true);
    reserveAiRequest.mockResolvedValue(undefined);
    extractApHistoryPdf.mockResolvedValue({
      importDigest: 'a'.repeat(64),
      title: 'New Deal DBQ',
      essayType: 'dbq',
      prompt: 'Evaluate the extent to which the New Deal expanded federal power.',
      periodNumber: 7,
      reasoningSkill: 'causation',
      sources: [
        {
          position: 1,
          title: 'Document 1',
          attribution: 'Franklin D. Roosevelt, 1933',
          body: 'This Nation asks for action, and action now.',
        },
      ],
    });
  });

  test('extracts a bounded APUSH assignment after tenant and class authorization', async () => {
    const response = await action({ request: requestFor(), params: {} } as any);
    const body = await readBody(response);

    expect(body).toMatchObject({
      success: true,
      importDigest: 'a'.repeat(64),
      essayType: 'dbq',
      periodNumber: 7,
    });
    expect(prisma.class.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'class-1',
          isArchived: false,
          teachers: { some: { id: 'teacher-1' } },
          school: { organizationId: 'org-1' },
        }),
      }),
    );
    expect(reserveAiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        membershipId: 'teacher-1',
        organizationId: 'org-1',
        feature: 'ap-history-pdf-import',
      }),
    );
    const bytes = extractApHistoryPdf.mock.calls[0]?.[0].pdfBytes as Buffer;
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  });

  test('fails closed when the tenant import gate is disabled', async () => {
    isApHistoryPdfImportEnabled.mockReturnValue(false);

    const response = await action({ request: requestFor(), params: {} } as any);
    expect(responseStatus(response)).toBe(404);
    expect(extractApHistoryPdf).not.toHaveBeenCalled();
  });

  test('rejects students and cross-tenant or unowned classes', async () => {
    requireMembership.mockResolvedValueOnce({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1' },
    });
    let response = await action({ request: requestFor(), params: {} } as any);
    expect(responseStatus(response)).toBe(403);

    requireMembership.mockResolvedValueOnce({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1' },
    });
    prisma.class.findFirst.mockResolvedValueOnce(null);
    response = await action({ request: requestFor(), params: {} } as any);
    expect(responseStatus(response)).toBe(404);
    expect(extractApHistoryPdf).not.toHaveBeenCalled();
  });

  test('rejects non-PDF magic bytes before reserving AI capacity', async () => {
    const response = await action({
      request: requestFor({
        file: new File(['not really a pdf'], 'fake.pdf', {
          type: 'application/pdf',
        }),
      }),
      params: {},
    } as any);

    expect(responseStatus(response)).toBe(400);
    expect(reserveAiRequest).not.toHaveBeenCalled();
    expect(extractApHistoryPdf).not.toHaveBeenCalled();
  });

  test('returns a retry-after response when AI admission is exhausted', async () => {
    reserveAiRequest.mockRejectedValue(new AiRateLimitError(60));

    const response = await action({ request: requestFor(), params: {} } as any);
    expect(responseStatus(response)).toBe(429);
    const responseWithInit = response as any;
    const headers =
      responseWithInit.headers instanceof Headers
        ? responseWithInit.headers
        : new Headers(responseWithInit.init?.headers);
    expect(headers.get('Retry-After')).toBe('60');
    expect(extractApHistoryPdf).not.toHaveBeenCalled();
  });

  test('redacts provider failures behind a stable response', async () => {
    extractApHistoryPdf.mockRejectedValue(
      new Error('provider secret and raw response'),
    );

    const response = await action({ request: requestFor(), params: {} } as any);
    const body = await readBody(response);
    expect(responseStatus(response)).toBe(502);
    expect(body.message).toBe(
      'Could not read that AP History PDF. Please try again.',
    );
    expect(JSON.stringify(body)).not.toContain('provider secret');
  });
});
