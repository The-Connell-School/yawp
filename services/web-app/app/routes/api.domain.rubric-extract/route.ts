import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { anthropic } from '~/services/anthropic';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  buildRubricExtractSystemPrompt,
  ExtractedRubricSchema,
  normalizeExtractedRubric,
} from '~/domain/assignment-types/rubric-extract.server';
import { parseFirstJsonValue } from '~/utils/llm-json.server';

const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);

  const formData = await request.formData();
  const text = formData.get('text');
  const file = formData.get('file');

  const pastedText =
    typeof text === 'string' && text.trim().length > 0 ? text.trim() : null;

  if (!(file instanceof File) && !pastedText) {
    return dataResponse(
      {
        success: false,
        message: 'Paste rubric text or upload a PDF.',
      },
      { status: 400 }
    );
  }

  if (file instanceof File) {
    if (file.size <= 0) {
      return dataResponse(
        { success: false, message: 'Uploaded PDF is empty.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_PDF_BYTES) {
      return dataResponse(
        {
          success: false,
          message: 'PDF is too large. Maximum size is 10 MB.',
        },
        { status: 400 }
      );
    }

    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return dataResponse(
        { success: false, message: 'Only PDF files are supported.' },
        { status: 400 }
      );
    }
  }

  const model =
    process.env.AI_MODEL && process.env.AI_MODEL.includes('claude')
      ? process.env.AI_MODEL
      : 'claude-sonnet-4-6';

  const system = buildRubricExtractSystemPrompt();
  const startedAt = Date.now();
  const metadata = {
    route: '/api/domain/rubric-extract',
    source: file instanceof File ? 'pdf' : 'text',
    fileName: file instanceof File ? file.name : undefined,
    fileSize: file instanceof File ? file.size : undefined,
    textLength: pastedText?.length ?? 0,
  };

  try {
    const userContent =
      file instanceof File
        ? [
            {
              type: 'document' as const,
              source: {
                type: 'base64' as const,
                media_type: 'application/pdf' as const,
                data: Buffer.from(await file.arrayBuffer()).toString('base64'),
              },
            },
            {
              type: 'text' as const,
              text: [
                'Extract the grading rubric from this document.',
                pastedText
                  ? `Additional context from the admin:\n${pastedText}`
                  : null,
                'Return strict JSON only.',
              ]
                .filter(Boolean)
                .join('\n\n'),
            },
          ]
        : [
            {
              type: 'text' as const,
              text: [
                'Extract the grading rubric from this pasted text.',
                pastedText,
                'Return strict JSON only.',
              ].join('\n\n'),
            },
          ];

    const message = await anthropic.messages.create({
      model,
      max_tokens: 2000,
      temperature: 0,
      system,
      messages: [
        {
          role: 'user',
          content: userContent,
        },
      ],
    } as any);

    const responseText = (message.content as any[])
      .map((part) => (part?.type === 'text' ? (part.text as string) : ''))
      .join('\n')
      .trim();

    const parsed = ExtractedRubricSchema.parse(parseFirstJsonValue(responseText));
    const normalized = normalizeExtractedRubric(parsed);

    await prisma.llmLog.create({
      data: {
        model,
        provider: 'anthropic',
        systemPrompt: system,
        messages: metadata,
        response: responseText,
        inputTokens: message.usage?.input_tokens,
        outputTokens: message.usage?.output_tokens,
        totalTokens:
          (message.usage?.input_tokens ?? 0) +
          (message.usage?.output_tokens ?? 0),
        durationMs: Date.now() - startedAt,
        metadata,
      },
    });

    return dataResponse({
      success: true,
      scoringScale: normalized.scoringScale,
      rubric: normalized.rubric,
    });
  } catch (error) {
    const messageText =
      error instanceof z.ZodError
        ? 'Could not parse rubric data. Try editing manually.'
        : 'Failed to extract rubric. Please try again.';

    await prisma.llmLog
      .create({
        data: {
          model,
          provider: 'anthropic',
          systemPrompt: system,
          messages: metadata,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt,
          metadata,
        },
      })
      .catch(() => {});

    return dataResponse(
      {
        success: false,
        message: messageText,
      },
      { status: 500 }
    );
  }
}
