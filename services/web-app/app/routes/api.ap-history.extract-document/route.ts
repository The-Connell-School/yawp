import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { z } from 'zod';
import { anthropic } from '~/services/anthropic';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { parseFirstJsonValue } from '~/utils/llm-json.server';

const MAX_PDF_BYTES = 10 * 1024 * 1024;

const ExtractedApHistorySchema = z.object({
  title: z.string().trim().max(200).optional(),
  essayType: z.enum(['dbq', 'leq']).optional(),
  prompt: z.string().trim().min(1),
  periodNumber: z.coerce.number().int().min(1).max(9).optional(),
  reasoningSkill: z.string().trim().optional(),
  sources: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        attribution: z.string().trim().default(''),
        body: z.string().trim().min(1),
        isVisual: z.boolean().optional(),
      })
    )
    .default([]),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'TEACHER') {
    return dataResponse(
      { success: false, message: 'Only teachers can extract documents.' },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File) || file.size <= 0) {
    return dataResponse(
      { success: false, message: 'A PDF file is required.' },
      { status: 400 }
    );
  }
  if (file.size > MAX_PDF_BYTES) {
    return dataResponse(
      { success: false, message: 'PDF is too large. Maximum size is 10 MB.' },
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

  const pdfBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');

  const model =
    process.env.AI_MODEL && process.env.AI_MODEL.includes('claude')
      ? process.env.AI_MODEL
      : 'claude-sonnet-4-6';

  const system = [
    'You extract APUSH (AP U.S. History) DBQ and LEQ writing assignments from PDFs.',
    'Return only valid JSON in this exact shape:',
    '{"title":"string?","essayType":"dbq|leq","prompt":"string","periodNumber":number?,"reasoningSkill":"string?","sources":[{"title":"string","attribution":"string","body":"string","isVisual":boolean}]}',
    'prompt is the full essay prompt students must answer.',
    'essayType is "dbq" if the assignment includes source documents to analyze, otherwise "leq".',
    'For a DBQ, put every document in sources: title (e.g. "Document 1"), attribution (author, source, date), and body (the full transcribed document text).',
    'Set isVisual true when a document is primarily an image (political cartoon, map, chart, photograph, painting); for a visual document, body should describe what the image depicts.',
    'For an LEQ, sources must be an empty array.',
    'periodNumber is the APUSH period 1-9 if identifiable, otherwise omit it.',
    'Never include markdown fences or explanatory text.',
  ].join('\n');

  const startedAt = Date.now();
  const metadata = {
    route: '/api/ap-history/extract-document',
    fileName: file.name,
    fileSize: file.size,
  };

  try {
    const message = await anthropic.messages.create({
      model,
      max_tokens: 4000,
      temperature: 0,
      system,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
            },
            {
              type: 'text',
              text: 'Extract the APUSH assignment as strict JSON only.',
            },
          ],
        },
      ],
    } as any);

    const responseText = (message.content as any[])
      .map((part) => (part?.type === 'text' ? (part.text as string) : ''))
      .join('\n')
      .trim();

    const parsed = ExtractedApHistorySchema.parse(
      parseFirstJsonValue(responseText)
    );

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
      title: parsed.title?.trim() ?? '',
      essayType:
        parsed.essayType ?? (parsed.sources.length > 0 ? 'dbq' : 'leq'),
      prompt: parsed.prompt.trim(),
      periodNumber: parsed.periodNumber ?? null,
      reasoningSkill: parsed.reasoningSkill?.trim() ?? null,
      sources: parsed.sources.map((source, index) => ({
        position: index + 1,
        title: source.title.trim(),
        attribution: source.attribution.trim(),
        body: source.body.trim(),
        isVisual: source.isVisual ?? false,
      })),
    });
  } catch (error) {
    const messageText =
      error instanceof z.ZodError
        ? 'Could not read a DBQ or LEQ from that PDF. Please fill it in manually.'
        : 'Failed to extract from the PDF. Please try again.';

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
      { success: false, message: messageText },
      { status: 502 }
    );
  }
}
