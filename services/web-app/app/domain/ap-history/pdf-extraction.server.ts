import { createHash } from 'node:crypto';
import { z } from 'zod';
import { anthropic } from '~/services/anthropic';
import { prisma } from '~/utils/db.server';
import { parseFirstJsonValue } from '~/utils/llm-json.server';

const ExtractedApHistorySchema = z.object({
  title: z.string().trim().max(200).optional(),
  essayType: z.enum(['dbq', 'leq']).optional(),
  prompt: z.string().trim().min(1).max(8_000),
  periodNumber: z.coerce.number().int().min(1).max(9).optional(),
  reasoningSkill: z
    .enum([
      'causation',
      'comparison',
      'continuity-and-change',
      'periodization',
    ])
    .optional(),
  sources: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        attribution: z.string().trim().min(1).max(500),
        body: z.string().trim().min(1).max(20_000),
        isVisual: z.boolean().optional(),
      }),
    )
    .max(10)
    .default([]),
});

export type ExtractedApHistoryPdf = {
  importDigest: string;
  title: string;
  essayType: 'dbq' | 'leq';
  prompt: string;
  periodNumber: number | null;
  reasoningSkill:
    | 'causation'
    | 'comparison'
    | 'continuity-and-change'
    | 'periodization'
    | null;
  sources: Array<{
    position: number;
    title: string;
    attribution: string;
    body: string;
    isVisual: boolean;
  }>;
};

const SYSTEM_PROMPT = [
  'You extract AP U.S. History DBQ and LEQ writing assignments from PDFs.',
  'Return only valid JSON in this exact shape:',
  '{"title":"string?","essayType":"dbq|leq","prompt":"string","periodNumber":number?,"reasoningSkill":"causation|comparison|continuity-and-change|periodization?","sources":[{"title":"string","attribution":"string","body":"string","isVisual":boolean}]}',
  'prompt is the complete essay prompt students must answer.',
  'Use dbq only when the PDF includes source documents to analyze.',
  'For a DBQ, include every source with a nonempty title, attribution, and full text or accessible visual description.',
  'For an LEQ, return an empty sources array.',
  'Never include markdown fences or explanatory text.',
].join('\n');

function responseTextFromMessage(message: {
  content: Array<{ type: string; text?: string }>;
}) {
  return message.content
    .map((part) => (part.type === 'text' ? (part.text ?? '') : ''))
    .join('\n')
    .trim();
}

async function writeMetadataOnlyLog(input: {
  model: string;
  durationMs: number;
  importDigest: string;
  pdfByteLength: number;
  message?: {
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  status: 'success' | 'failed';
}) {
  const inputTokens = input.message?.usage?.input_tokens;
  const outputTokens = input.message?.usage?.output_tokens;
  await prisma.llmLog
    .create({
      data: {
        model: input.model,
        provider: 'anthropic',
        inputTokens,
        outputTokens,
        totalTokens:
          inputTokens === undefined && outputTokens === undefined
            ? undefined
            : (inputTokens ?? 0) + (outputTokens ?? 0),
        durationMs: input.durationMs,
        messages: {
          redacted: true,
          contentTypes: ['document', 'text'],
        },
        ...(input.status === 'failed'
          ? { error: 'provider_or_validation_failure' }
          : {}),
        metadata: {
          feature: 'ap-history-pdf-import',
          kind: 'ap-history-pdf-extraction',
          status: input.status,
          importDigest: input.importDigest,
          pdfByteLength: input.pdfByteLength,
          sensitiveContentStored: false,
        },
      },
    })
    .catch(() => {
      // Extraction remains available when noncritical observability is down.
    });
}

export async function extractApHistoryPdf({
  pdfBytes,
}: {
  pdfBytes: Buffer;
}): Promise<ExtractedApHistoryPdf> {
  const importDigest = createHash('sha256').update(pdfBytes).digest('hex');
  const model =
    process.env.AI_MODEL?.includes('claude')
      ? process.env.AI_MODEL
      : 'claude-sonnet-4-6';
  const startedAt = Date.now();
  let message:
    | {
        content: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      }
    | undefined;

  try {
    message = (await anthropic.messages.create({
      model,
      max_tokens: 4_000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBytes.toString('base64'),
              },
            },
            {
              type: 'text',
              text: 'Extract this approved public-domain APUSH assignment as strict JSON.',
            },
          ],
        },
      ],
    } as never)) as typeof message;

    const parsed = ExtractedApHistorySchema.parse(
      parseFirstJsonValue(responseTextFromMessage(message!)),
    );
    const essayType =
      parsed.essayType ?? (parsed.sources.length > 0 ? 'dbq' : 'leq');
    const sources =
      essayType === 'dbq'
        ? parsed.sources.map((source, index) => ({
            position: index + 1,
            title: source.title,
            attribution: source.attribution,
            body: source.body,
            isVisual: source.isVisual ?? false,
          }))
        : [];

    if (essayType === 'dbq' && sources.length === 0) {
      throw new Error('DBQ extraction did not include sources');
    }

    await writeMetadataOnlyLog({
      model,
      durationMs: Date.now() - startedAt,
      importDigest,
      pdfByteLength: pdfBytes.byteLength,
      message,
      status: 'success',
    });

    return {
      importDigest,
      title: parsed.title ?? '',
      essayType,
      prompt: parsed.prompt,
      periodNumber: parsed.periodNumber ?? null,
      reasoningSkill: parsed.reasoningSkill ?? null,
      sources,
    };
  } catch (error) {
    await writeMetadataOnlyLog({
      model,
      durationMs: Date.now() - startedAt,
      importDigest,
      pdfByteLength: pdfBytes.byteLength,
      message,
      status: 'failed',
    });
    throw error;
  }
}
