import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const POST = z.object({
  gradeId: z.string(),
  content: z.string().min(1),
  excerpt: z.string().min(1).max(120),
  occurrence: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 1))
    .refine((v) => Number.isFinite(v) && v >= 1, 'Invalid occurrence'),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const grade = await prisma.grade.findFirst({
    where: {
      id: data.gradeId,
      snapshot: {
        document: {
          deletedAt: null,
          class: { teachers: { some: { profileId: profile.id } } },
        },
      },
    },
    select: { id: true },
  });

  if (!grade) {
    return dataResponse(
      { success: false, message: 'Only teachers can add grading comments.' },
      { status: 403 }
    );
  }

  const created = await prisma.gradeComment.create({
    data: {
      gradeId: data.gradeId,
      profileId: profile.id,
      content: data.content,
      excerpt: data.excerpt,
      occurrence: data.occurrence,
    },
    include: {
      profile: { include: { user: { select: { name: true, email: true } } } },
      responses: {
        include: {
          profile: { include: { user: { select: { name: true, email: true } } } },
        },
      },
    },
  });

  return dataResponse({ success: true, comment: created }, { status: 201 });
}

