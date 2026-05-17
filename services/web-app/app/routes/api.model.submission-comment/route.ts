import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const POST = z
  .object({
    submissionId: z.string(),
    content: z.string().min(1),
    excerpt: z.string().min(1).optional(),
    occurrence: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : 1))
      .refine((v) => Number.isFinite(v) && v >= 1, 'Invalid occurrence'),
  })
  .refine((data) => Boolean(data.excerpt?.trim()), {
    message:
      'Comments must be tied to specific text. Select text and use Comment.',
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

  // Verify the submission exists and the user is a teacher of the class (or admin)
  const submission = await prisma.submission.findFirst({
    where: {
      id: data.submissionId,
      document: {
        is: {
          deletedAt: null,
          profileId: { not: profile.id },
          ...(isAdmin
            ? {}
            : {
                class: {
                  teachers: { some: { profileId: profile.id } },
                },
              }),
        },
      },
    },
    select: { id: true },
  });

  if (!submission) {
    return dataResponse(
      {
        success: false,
        message: 'Only teachers or admins can add submission comments.',
      },
      { status: 403 }
    );
  }

  const created = await prisma.submissionComment.create({
    data: {
      submission: { connect: { id: submission.id } },
      profile: { connect: { id: profile.id } },
      content: data.content,
      occurrence: data.occurrence,
      ...(data.excerpt != null &&
        data.excerpt !== '' && { excerpt: data.excerpt }),
    },
    include: {
      profile: {
        include: { user: { select: { name: true, email: true } } },
      },
    },
  });

  return dataResponse({ success: true, comment: created }, { status: 201 });
}
