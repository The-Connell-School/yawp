import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { anthropic } from '~/services/anthropic';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { isAssignmentsEnabledForContext } from '~/utils/feature-flags.server';
import { parseFirstJsonValue } from '~/utils/llm-json.server';

const MAX_PDF_BYTES = 10 * 1024 * 1024;

const ExtractedAssignmentSchema = z.object({
  title: z.string().trim().max(200).optional(),
  prompt: z.string().trim().min(1),
  tutorContext: z.string().trim().optional(),
});

function safeText(value: string | undefined): string {
  return value?.trim() ?? '';
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.teacherProfile) {
    return dataResponse(
      {
        success: false,
        message: 'Only teachers can extract assignment prompts.',
      },
      { status: 403 }
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
          id: profile.teacherProfile.id,
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

  const assignmentsEnabled = await isAssignmentsEnabledForContext({
    organizationId: classAccess.school.organizationId,
    schoolId: classAccess.school.id,
    teacherProfileId: profile.teacherProfile.id,
    classIds: [classAccess.id],
  });
  if (!assignmentsEnabled) {
    return dataResponse(
      {
        success: false,
        message: 'Assignments are not enabled for your organization.',
      },
      { status: 403 }
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
    '{"title":"string?","prompt":"string","tutorContext":"string?"}',
    'prompt must be the full assignment directions students should see above the editor.',
    'tutorContext should contain concise tutor guidance for coaching within this assignment when available.',
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
    const message = await anthropic.messages.create({
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
                'Also infer tutorContext that helps a writing tutor coach this assignment.',
                'Return strict JSON only.',
              ].join(' '),
            },
          ],
        },
      ],
    } as any);

    const responseText = (message.content as any[])
      .map((part) => (part?.type === 'text' ? (part.text as string) : ''))
      .join('\n')
      .trim();

    const parsed = ExtractedAssignmentSchema.parse(
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
      title: safeText(parsed.title),
      prompt: parsed.prompt.trim(),
      tutorContext: safeText(parsed.tutorContext),
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
