import { beforeEach, describe, expect, mock, test } from 'bun:test';

const anthropic = {
  messages: {
    create: mock(),
  },
};
const prisma = {
  class: {
    findFirst: mock(),
  },
  llmLog: {
    create: mock(),
  },
};
const requireUserId = mock();
const requireMembership = mock();
const isAssignmentsEnabledForContext = mock();

mock.module('~/services/anthropic', () => ({ anthropic }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/feature-flags.server', () => ({
  isAssignmentsEnabledForContext,
}));

const { action } = await import('./route');

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

describe('api.domain.assignment-pdf-extract', () => {
  beforeEach(() => {
    anthropic.messages.create.mockReset();
    prisma.class.findFirst.mockReset();
    prisma.llmLog.create.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    isAssignmentsEnabledForContext.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
    });
    prisma.class.findFirst.mockResolvedValue({
      id: 'class-1',
      school: { id: 'school-1', organizationId: 'org-1' },
    });
    prisma.llmLog.create.mockResolvedValue({ id: 'log-1' });
    isAssignmentsEnabledForContext.mockResolvedValue(true);
  });

  test('extracts only title and student prompt from assignment PDFs', async () => {
    let capturedArgs: any;
    anthropic.messages.create.mockImplementation(async (args: any) => {
      capturedArgs = args;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              title: 'Extracted Assignment',
              prompt: 'Write a literary analysis essay.',
              tutorContext: 'This legacy field should be ignored.',
            }),
          },
        ],
        usage: { input_tokens: 12, output_tokens: 8 },
      };
    });

    const form = new FormData();
    form.set('classId', 'class-1');
    form.set(
      'file',
      new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'assignment.pdf', {
        type: 'application/pdf',
      })
    );

    const response = await action({
      request: new Request('https://example.test/api/domain/assignment-pdf-extract', {
        method: 'POST',
        body: form,
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body).toEqual({
      success: true,
      title: 'Extracted Assignment',
      prompt: 'Write a literary analysis essay.',
    });
    expect(capturedArgs.system).toContain(
      '{"title":"string?","prompt":"string"}'
    );
    expect(capturedArgs.system).not.toContain('tutorContext');
    expect(capturedArgs.messages[0].content[1].text).not.toContain(
      'tutorContext'
    );
  });
});
