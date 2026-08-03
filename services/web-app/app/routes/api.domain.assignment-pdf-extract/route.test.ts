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

mock.module('~/services/anthropic', () => ({ anthropic }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
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
  });

  test('extracts only title and student prompt from assignment PDFs', async () => {
    let capturedArgs: any;
    let capturedOptions: any;
    anthropic.messages.create.mockImplementation(async (args: any, options: any) => {
      capturedArgs = args;
      capturedOptions = options;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              title: 'Extracted Assignment',
              prompt: 'Write a literary analysis essay.',
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
      truncated: false,
    });
    expect(capturedArgs.system).toContain(
      '{"title":"string?","prompt":"string"}'
    );
    expect(capturedArgs.max_tokens).toBe(1200);
    expect(capturedOptions.signal).toBeInstanceOf(AbortSignal);
  });

  test('salvages a truncated prompt and flags it when the model hits the token limit', async () => {
    anthropic.messages.create.mockResolvedValue({
      stop_reason: 'max_tokens',
      content: [
        {
          type: 'text',
          text: '{"title":"Long Essay Prompt","prompt":"Write a five-page essay analyzing the theme of ambition in the novel, focusing on how the author uses',
        },
      ],
      usage: { input_tokens: 900, output_tokens: 1200 },
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
    expect(body.success).toBe(true);
    expect(body.truncated).toBe(true);
    expect(body.title).toBe('Long Essay Prompt');
    expect(body.prompt).toStartWith(
      'Write a five-page essay analyzing the theme of ambition in the novel'
    );
    expect(body.prompt).not.toContain('\\"');
  });

  test('reports failure when the response is unparseable and was not truncated', async () => {
    anthropic.messages.create.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'not json at all' }],
      usage: { input_tokens: 10, output_tokens: 5 },
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
    expect(body.success).toBe(false);
  });
});
