import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const POST = z.object({
  commentId: z.string(),
  content: z.string().min(1),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const comment = await prisma.gradeComment.findFirst({
    where: { id: data.commentId },
    select: {
      id: true,
      grade: {
        select: {
          releasedAt: true,
          snapshot: {
            select: {
              document: {
                select: {
                  profileId: true,
                  class: { select: { teachers: { select: { profileId: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!comment) {
    return dataResponse(
      { success: false, message: 'Comment not found.' },
      { status: 404 }
    );
  }

  const isStudentOwner = comment.grade.snapshot.document.profileId === profile.id;
  const teachers = comment.grade.snapshot.document.class?.teachers ?? [];
  const isTeacherOfClass = teachers.some((t) => t.profileId === profile.id);

  if (isStudentOwner) {
    if (!comment.grade.releasedAt) {
      return dataResponse(
        {
          success: false,
          message: 'You can reply once the grade has been released.',
        },
        { status: 403 }
      );
    }
  } else if (!isTeacherOfClass) {
    return dataResponse(
      { success: false, message: 'Not authorized.' },
      { status: 403 }
    );
  }

  const created = await prisma.gradeCommentResponse.create({
    data: {
      commentId: data.commentId,
      profileId: profile.id,
      content: data.content,
    },
    include: {
      profile: { include: { user: { select: { name: true, email: true } } } },
    },
  });

  return dataResponse({ success: true, response: created }, { status: 201 });
}
