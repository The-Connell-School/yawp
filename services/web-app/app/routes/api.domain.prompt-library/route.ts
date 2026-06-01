import { data as dataResponse, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { z } from 'zod';
import { Prisma } from '@app/prisma';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { parseFirstJsonValue } from '~/utils/llm-json.server';

const ListQuerySchema = z.object({
  assignmentTypeKind: z.string().min(1),
  essayType: z.string().optional(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  await requireProfile(request, userId);

  const url = new URL(request.url);
  const query = ListQuerySchema.safeParse({
    assignmentTypeKind: url.searchParams.get('assignmentTypeKind'),
    essayType: url.searchParams.get('essayType') || undefined,
  });

  if (!query.success) {
    return dataResponse(
      { success: false, message: 'assignmentTypeKind is required.' },
      { status: 400 }
    );
  }

  const where: Record<string, unknown> = {
    assignmentTypeKind: query.data.assignmentTypeKind,
  };
  if (query.data.essayType) {
    where.essayType = query.data.essayType;
  }

  const entries = await prisma.promptLibraryEntry.findMany({
    where,
    include: {
      calibrationSamples: {
        select: {
          id: true,
          tier: true,
          score: true,
        },
      },
    },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  });

  return dataResponse({ success: true, entries });
}

const CreateSchema = z.object({
  assignmentTypeKind: z.string().min(1),
  essayType: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  promptBody: z.string().trim().min(1),
  sourcePassages: z.string().optional(),
  year: z.coerce.number().int().optional(),
  tags: z.string().optional(),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.teacherProfile) {
    return dataResponse(
      { success: false, message: 'Only teachers can manage prompts.' },
      { status: 403 }
    );
  }

  const method = request.method.toUpperCase();

  if (method === 'POST') {
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === 'string') raw[key] = value;
    }

    const parsed = CreateSchema.safeParse(raw);
    if (!parsed.success) {
      return dataResponse(
        { success: false, message: 'Invalid prompt data.', errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    let sourcePassagesJson: Prisma.InputJsonValue | typeof Prisma.JsonNull =
      Prisma.JsonNull;
    if (parsed.data.sourcePassages) {
      try {
        const value = parseFirstJsonValue(parsed.data.sourcePassages);
        sourcePassagesJson =
          value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
      } catch {
        sourcePassagesJson = Prisma.JsonNull;
      }
    }

    let tagsJson: Prisma.InputJsonValue | typeof Prisma.JsonNull =
      Prisma.JsonNull;
    if (parsed.data.tags) {
      try {
        const value = parseFirstJsonValue(parsed.data.tags);
        tagsJson =
          value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
      } catch {
        tagsJson = Prisma.JsonNull;
      }
    }

    const entry = await prisma.promptLibraryEntry.create({
      data: {
        assignmentTypeKind: parsed.data.assignmentTypeKind,
        essayType: parsed.data.essayType,
        title: parsed.data.title,
        promptBody: parsed.data.promptBody,
        sourcePassages: sourcePassagesJson,
        year: parsed.data.year ?? null,
        tags: tagsJson,
        isSystem: false,
        createdById: profile.id,
      },
    });

    return dataResponse({ success: true, entry }, { status: 201 });
  }

  if (method === 'DELETE') {
    const formData = await request.formData();
    const id = formData.get('id');
    if (typeof id !== 'string' || !id.trim()) {
      return dataResponse(
        { success: false, message: 'Prompt ID is required.' },
        { status: 400 }
      );
    }

    const entry = await prisma.promptLibraryEntry.findUnique({
      where: { id: id.trim() },
      select: { id: true, createdById: true, isSystem: true },
    });

    if (!entry) {
      return dataResponse(
        { success: false, message: 'Prompt not found.' },
        { status: 404 }
      );
    }

    if (entry.isSystem) {
      return dataResponse(
        { success: false, message: 'System prompts cannot be deleted.' },
        { status: 403 }
      );
    }

    if (entry.createdById !== profile.id) {
      return dataResponse(
        { success: false, message: 'You can only delete your own prompts.' },
        { status: 403 }
      );
    }

    await prisma.promptLibraryEntry.delete({ where: { id: entry.id } });
    return dataResponse({ success: true });
  }

  return dataResponse(
    { success: false, message: 'Method not allowed.' },
    { status: 405 }
  );
}
