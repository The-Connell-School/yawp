import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { anthropic } from '~/services/anthropic';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { parseFirstJsonValue } from '~/utils/llm-json.server';
import { enforcePdfExtractorLimits, rateLimitedJson, withAdvisorySingleFlight } from '~/utils/rate-limit.server';
import { RATE_LIMITS } from '~/config/rate-limits';

const MAX_PDF_BYTES = RATE_LIMITS.pdfExtract.maxBytes;

const ExtractedAssignmentSchema = z.object({
  title: z.string().trim().max(200).optional(),
  prompt: z.string().trim().min(1),
});

function safeText(value: string | undefined): string {
  return value?.trim() ?? '';
}

/**
 * Best-effort recovery for a response that got cut off by the max_tokens
 * limit mid-string. The JSON is incomplete (no closing quote/brace), so we
 * pull whatever prompt text made it through instead of discarding the whole
 * extraction.
 */
function salvageTruncatedExtraction(
  responseText: string
): { title?: string; prompt: string } | null {
  const promptKeyMatch = responseText.match(/"prompt"\s*:\s*"/);
  if (!promptKeyMatch || promptKeyMatch.index === undefined) return null;

  let raw = responseText.slice(promptKeyMatch.index + promptKeyMatch[0].length);
  if (raw.endsWith('\\')) raw = raw.slice(0, -1);
  raw = raw
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim();
  if (!raw) return null;

  const titleMatch = responseText.match(/"title"\s*:\s*"([^"]*)"/);
  return { title: titleMatch?.[1], prompt: raw };
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== "TEACHER") {
    return dataResponse(
      {
        success: false,
        message: 'Only teachers can extract assignment prompts.',
      },
      { status: 403 }
    );
  }

  {
    const decision = await enforcePdfExtractorLimits({
      membershipId: profile.id,
      route: '/api/domain/assignment-pdf-extract',
      feature: 'assignment-pdf-extract',
    });
    if (!decision.allowed) {
      return rateLimitedJson(decision.scope, decision.retryAfterSeconds, 'Please wait before extracting another PDF.');
    }
  }

  const contentLength = Number(request.headers.get('content-length'));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_PDF_BYTES + 1024 * 1024
  ) {
    return dataResponse(
      { success: false, message: 'PDF is too large. Maximum size is 10 MB.' },
      { status: 413 }
    );
  }

  const formData = await request.formData();
  const classIdRaw = formData.get('classId');
  const file = formData.get('file');

  if (typeof classIdRaw !== 'string' || !classIdRaw.trim()) {
    return dataResponse(
      { success: false, message: 'Class is required.' },
      { status: 400 }
    );
  }

  if (!(file instanceof File)) {
    return dataResponse(
      { success: false, message: 'PDF file is required.' },
      { status: 400 }
    );
  }

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

  const classId = classIdRaw.trim();
  const classAccess = await prisma.class.findFirst({
    where: {
      id: classId,
      teachers: {
        some: {
          id: profile.id,
        },
      },
    },
    select: {
      id: true,
      school: { select: { id: true, organizationId: true } },
    },
  });

  if (!classAccess) {
    return dataResponse(
      { success: false, message: 'Class not found.' },
      { status: 404 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const pdfBase64 = bytes.toString('base64');

  const model =
    process.env.AI_MODEL && process.env.AI_MODEL.includes('claude')
      ? process.env.AI_MODEL
      : 'claude-sonnet-4-6';

  const system = [
    'You extract classroom writing assignments from PDFs.',
    'Return only valid JSON in this exact shape:',
    '{"title":"string?","prompt":"string"}',
    'prompt must be the full assignment directions students should see above the editor.',
    'Never include markdown fences or explanatory text.',
  ].join('\n');

  const startedAt = Date.now();
  const metadata = {
    route: '/api/domain/assignment-pdf-extract',
    classId,
    fileName: file.name,
    fileSize: file.size,
  };

  try {
    const message = await withAdvisorySingleFlight(
      `pdf-extract:${profile.id}:assignment`,
      () => anthropic.messages.create(
      {
        model,
        max_tokens: 1200,
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
                text: [
                  'Extract the assignment for student writing.',
                  'If multiple prompts appear, choose the primary essay prompt.',
                  'Return strict JSON only.',
                ].join(' '),
              },
            ],
          },
        ],
      } as any,
      { signal: AbortSignal.timeout(30_000) }
    ));

    const responseText = (message.content as any[])
      .map((part) => (part?.type === 'text' ? (part.text as string) : ''))
      .join('\n')
      .trim();

    const hitTokenLimit = message.stop_reason === 'max_tokens';
    let parsed: { title?: string; prompt: string };
    let truncated = false;

    try {
      parsed = ExtractedAssignmentSchema.parse(
        parseFirstJsonValue(responseText)
      );
      truncated = hitTokenLimit;
    } catch (parseError) {
      const salvaged = hitTokenLimit
        ? salvageTruncatedExtraction(responseText)
        : null;
      if (!salvaged) throw parseError;
      parsed = salvaged;
      truncated = true;
    }

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
        metadata: { ...metadata, truncated },
      },
    });

    return dataResponse({
      success: true,
      title: safeText(parsed.title),
      prompt: parsed.prompt.trim(),
      truncated,
    });
  } catch (error) {
    const messageText =
      error instanceof z.ZodError
        ? 'Could not parse assignment data from the PDF. Please edit manually.'
        : 'Failed to extract assignment from PDF. Please try again.';

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
      .catch(() => {
        // Ignore logging failures.
      });

    return dataResponse(
      {
        success: false,
        message: messageText,
      },
      { status: 500 }
    );
  }
}
