import { invariant } from '@epic-web/invariant';
import { type ActionFunctionArgs } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { findSubmissionForTitleEdit } from '~/utils/submission-access.server';

const MAX_TITLE_LEN = 500;

function normalizeSubmissionTitle(raw: unknown) {
  if (typeof raw !== 'string') {
    return { ok: false as const, message: 'title must be a string.' };
  }
  const title = raw.trim();
  if (title.length > MAX_TITLE_LEN) {
    return { ok: false as const, message: 'Title is too long.' };
  }
  return { ok: true as const, title };
}

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No submission id provided');

  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'updateTitle') {
    const normalized = normalizeSubmissionTitle(formData.get('title'));
    if (!normalized.ok) {
      return Response.json(
        { success: false, message: normalized.message },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    const submission = await findSubmissionForTitleEdit({
      submissionId: params.id,
      profileId: profile.id,
      isAdmin: Boolean(user?.isAdmin),
    });

    if (!submission) {
      return Response.json(
        { success: false, message: 'Submission not found.' },
        { status: 404 }
      );
    }

    await prisma.submission.update({
      where: { id: submission.id },
      data: {
        title: normalized.title,
        updatedAt: new Date(),
      },
    });

    return Response.json({ success: true, title: normalized.title });
  }

  if (intent !== 'archive' && intent !== 'unarchive') {
    return Response.json(
      {
        success: false,
        message:
          'Expected intent=archive, intent=unarchive, or intent=updateTitle.',
      },
      { status: 400 }
    );
  }

  const submission = await prisma.submission.findFirst({
    where: {
      id: params.id,
      document: {
        deletedAt: null,
        profileId: profile.id,
      },
    },
    select: { id: true },
  });

  if (!submission) {
    return Response.json(
      { success: false, message: 'Submission not found.' },
      { status: 404 }
    );
  }

  await prisma.submission.update({
    where: { id: submission.id },
    data: {
      archivedAt: intent === 'archive' ? new Date() : null,
      updatedAt: new Date(),
    },
  });

  return Response.json({ success: true });
}
