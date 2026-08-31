import { createHash } from 'node:crypto';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { isDocumentSubmittableContent } from '~/utils/document-submittable';
import { redirectWithToast } from '~/utils/toast.server';
import { hasEffectivePlatformAdmin } from '~/utils/preview-access.server';
import {
  buildSubmissionActivityChanges,
  buildSubmissionBodyAuditMetadata,
  recordSubmissionActivity,
  resolveSubmissionActivityActorMembershipId,
  submissionActivityEventTypes,
} from '~/domain/submissions/submission-activity.server';

const POST = z.object({ documentId: z.string(), title: z.string().optional() });

class SubmitDocumentConflictError extends Error {}

function hashString(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

const actionImpl = async ({ request }: ActionFunctionArgs) => {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);
  const isAdmin = hasEffectivePlatformAdmin(user?.isAdmin);
  const documentAccessWhere = {
    id: data.documentId,
    deletedAt: null,
    ...(isAdmin
      ? {}
      : {
          OR: [
            { membershipId: profile.id },
            {
              membership: {
                classesAsStudent: {
                  some: {
                    teachers: {
                      some: { id: profile.id },
                    },
                  },
                },
              },
            },
          ],
        }),
  };

  const document = await prisma.document.findFirst({
    where: documentAccessWhere,
    select: {
      id: true,
      html: true,
      text: true,
      title: true,
      revision: true,
      updatedAt: true,
      classAssignment: {
        select: {
          class: {
            select: {
              id: true,
              schoolId: true,
              school: { select: { organizationId: true } },
              teachers: { select: { id: true } },
            },
          },
        },
      },
      membership: {
        select: {
          organizationId: true,
          classesAsStudent: {
            select: {
              id: true,
              schoolId: true,
              school: { select: { organizationId: true } },
              teachers: { select: { id: true } },
            },
          },
        },
      },
      submissions: {
        take: 1,
        select: { id: true },
      },
    },
  });

  if (!document || !document.membership) {
    return redirectWithToast('/app/courses', {
      description: 'Document not found.',
      type: 'error',
    });
  }

  if (!isDocumentSubmittableContent(document.html ?? '', document.text ?? '')) {
    return redirectWithToast(`/app/documents/${data.documentId}`, {
      description: 'Cannot submit an empty document.',
      type: 'error',
    });
  }

  const html = document.html ?? '';
  const text = document.text ?? '';
  const now = new Date();
  const documentOrganizationId = document.membership.organizationId;

  const journal = await prisma.documentWriteJournal.create({
    data: {
      eventType: 'document.submit',
      source: 'submit-document',
      status: 'pending',
      userId,
      membershipId: profile.id,
      documentId: document.id,
      title: document.title,
      html,
      text,
      htmlHash: hashString(html),
      textHash: hashString(text),
      baseRevision: document.revision,
      metadata: {
        method: request.method,
        submittedAt: now.toISOString(),
      },
    },
  });

  try {
    const { submission: createdSubmission, document: finalDocument } =
      await prisma.$transaction(async (tx) => {
        const updatedDocument = await tx.document.updateMany({
          where: {
            ...documentAccessWhere,
            revision: document.revision,
            updatedAt: document.updatedAt,
            html: document.html,
            text: document.text,
          },
          data: { updatedAt: now },
        });
        if (updatedDocument.count !== 1) {
          throw new SubmitDocumentConflictError();
        }

        const submission = await tx.submission.create({
          data: {
            documentId: document.id,
            title: data.title || (document.title ?? ''),
            html,
            text,
            submittedAt: now,
          },
          select: { id: true, title: true, submittedAt: true },
        });

        const doc = await tx.document.findUniqueOrThrow({
          where: { id: document.id },
        });

        await recordSubmissionActivity(tx, {
          submissionId: submission.id,
          organizationId: documentOrganizationId ?? profile.organization.id,
          actorMembershipId: resolveSubmissionActivityActorMembershipId({
            actorMembershipId: profile.id,
            actorOrganizationId: profile.organization.id,
            submissionOrganizationId:
              documentOrganizationId ?? profile.organization.id,
          }),
          actorUserId: userId,
          eventType: submissionActivityEventTypes.created,
          source: 'submit-document',
          occurredAfterRelease: false,
          changes: buildSubmissionActivityChanges({
            before: { title: null, submittedAt: null },
            after: {
              title: submission.title,
              submittedAt: submission.submittedAt,
            },
            fields: ['title', 'submittedAt'],
          }),
          metadata: {
            body: buildSubmissionBodyAuditMetadata({ text, html }),
            documentId: document.id,
          },
        });

        await tx.documentWriteJournal.update({
          where: { id: journal.id },
          data: {
            status: 'accepted',
            resultingRevision: document.revision,
          },
        });

        return { submission, document: doc };
      });

    return dataResponse({
      success: true,
      document: finalDocument,
      submission: createdSubmission,
      message: 'Essay submitted successfully!',
    });
  } catch (error) {
    await prisma.documentWriteJournal.update({
      where: { id: journal.id },
      data: {
        status: 'rejected',
        failureReason:
          error instanceof Error ? error.message : 'submit_transaction_failed',
      },
    });
    if (error instanceof SubmitDocumentConflictError) {
      return dataResponse(
        {
          success: false,
          message:
            'This document changed before it could be submitted. Please refresh and try again.',
        },
        { status: 409 }
      );
    }
    throw error;
  }
};

export async function action(args: ActionFunctionArgs) {
  return actionImpl(args);
}
