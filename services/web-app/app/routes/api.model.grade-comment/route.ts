import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const POST = z
  .object({
    gradeId: z.string().optional(),
    snapshotId: z.string().optional(),
    content: z.string().min(1),
    excerpt: z.string().min(1).optional(),
    occurrence: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : 1))
      .refine((v) => Number.isFinite(v) && v >= 1, 'Invalid occurrence'),
  })
  .refine((data) => Boolean(data.gradeId || data.snapshotId), {
    message: 'A grade or snapshot is required.',
    path: ['gradeId'],
  })
  .refine((data) => Boolean(data.excerpt?.trim()), {
    message: 'Comments must be tied to specific text. Select text and use Comment.',
    path: ['excerpt'],
  });

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  const isAdmin = !!user?.isAdmin;
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  let resolvedGradeId: string | null = null;

  if (data.gradeId) {
    const grade = await (prisma as any).grade.findFirst({
      where: {
        id: data.gradeId,
        document: {
          deletedAt: null,
          ...(isAdmin
            ? {}
            : { class: { teachers: { some: { profileId: profile.id } } } }),
        },
      },
      select: { id: true },
    });

    if (!grade) {
      return dataResponse(
        {
          success: false,
          message: 'Only teachers or admins can add grading comments.',
        },
        { status: 403 }
      );
    }

    resolvedGradeId = grade.id;
  } else if (data.snapshotId) {
    const snapshot = await prisma.documentSnapshot.findFirst({
      where: {
        id: data.snapshotId,
        submittedAt: { not: null },
        archivedAt: null,
        document: {
          deletedAt: null,
          ...(isAdmin
            ? {}
            : {
                class: {
                  teachers: {
                    some: {
                      profileId: profile.id,
                    },
                  },
                },
              }),
        },
      },
      select: {
        id: true,
        documentId: true,
        grades: {
          select: {
            id: true,
          },
          take: 1,
        },
      },
    });

    if (!snapshot) {
      return dataResponse(
        {
          success: false,
          message: 'Only teachers or admins can add grading comments.',
        },
        { status: 403 }
      );
    }

    if (snapshot.grades[0]?.id) {
      resolvedGradeId = snapshot.grades[0].id;
    } else {
      const shellGrade = await (prisma as any).grade.upsert({
        where: { snapshotId: snapshot.id },
        create: {
          documentId: snapshot.documentId,
          snapshotId: snapshot.id,
          gradedById: profile.id,
        },
        update: {
          updatedAt: new Date(),
        },
        select: { id: true },
      });
      resolvedGradeId = shellGrade.id;
    }
  }

  if (!resolvedGradeId) {
    return dataResponse(
      { success: false, message: 'Unable to resolve grade for comment.' },
      { status: 400 }
    );
  }

  const created = await prisma.gradeComment.create({
    data: {
      grade: { connect: { id: resolvedGradeId } },
      profile: { connect: { id: profile.id } },
      content: data.content,
      occurrence: data.occurrence,
      ...(data.excerpt != null && data.excerpt !== '' && { excerpt: data.excerpt }),
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
