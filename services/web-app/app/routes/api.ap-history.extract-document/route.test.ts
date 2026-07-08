import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { llmLog: { create: mock() } };
const requireUserId = mock();
const requireMembership = mock();
const messagesCreate = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/services/anthropic', () => ({
  anthropic: { messages: { create: messagesCreate } },
}));

const { action } = await import('./route');

function pdfRequest(file: File | null) {
  const form = new FormData();
  if (file) form.append('file', file);
  return new Request('https://example.com/api/ap-history/extract-document', {
    method: 'POST',
    body: form,
  });
}

function pdfFile() {
  return new File(['%PDF-1.4 fake'], 'dbq.pdf', { type: 'application/pdf' });
}

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

describe('api.ap-history.extract-document', () => {
  beforeEach(() => {
    prisma.llmLog.create.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    messagesCreate.mockReset();
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'teacher-1', role: 'TEACHER' });
    prisma.llmLog.create.mockResolvedValue({ id: 'log-1' });
  });

  test('extracts a structured DBQ from an uploaded PDF', async () => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            title: 'Reconstruction DBQ',
            essayType: 'dbq',
            prompt:
              'Evaluate the extent to which Reconstruction changed the South.',
            periodNumber: 6,
            reasoningSkill: 'causation',
            sources: [
              {
                title: 'Document 1',
                attribution: 'Frederick Douglass, 1866',
                body: 'The work does not end with the abolition of slavery...',
              },
              {
                title: 'Document 2',
                attribution: 'Thomas Nast, Harper’s Weekly, 1874',
                body: 'A political cartoon on Reconstruction-era politics.',
                isVisual: true,
              },
            ],
          }),
        },
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    const response = await action({ request: pdfRequest(pdfFile()) } as any);
    const body = await readBody(response);

    expect(body.success).toBe(true);
    expect(body.essayType).toBe('dbq');
    expect(body.prompt).toContain('Reconstruction');
    expect(body.periodNumber).toBe(6);
    expect(body.sources).toHaveLength(2);
    expect(body.sources[0]).toMatchObject({
      position: 1,
      attribution: 'Frederick Douglass, 1866',
      isVisual: false,
    });
    expect(body.sources[1]).toMatchObject({ position: 2, isVisual: true });
    expect(prisma.llmLog.create).toHaveBeenCalled();
  });

  test('infers LEQ when no sources are present', async () => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            prompt: 'Evaluate the causes of the Market Revolution.',
            sources: [],
          }),
        },
      ],
      usage: {},
    });

    const response = await action({ request: pdfRequest(pdfFile()) } as any);
    const body = await readBody(response);

    expect(body.success).toBe(true);
    expect(body.essayType).toBe('leq');
    expect(body.sources).toEqual([]);
  });

  test('rejects a non-PDF file', async () => {
    const response = await action({
      request: pdfRequest(new File(['x'], 'a.png', { type: 'image/png' })),
    } as any);
    const body = await readBody(response);
    expect(body.success).toBe(false);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  test('returns a friendly error when extraction cannot be parsed', async () => {
    messagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
      usage: {},
    });

    const response = await action({ request: pdfRequest(pdfFile()) } as any);
    const body = await readBody(response);
    expect(body.success).toBe(false);
  });
});
