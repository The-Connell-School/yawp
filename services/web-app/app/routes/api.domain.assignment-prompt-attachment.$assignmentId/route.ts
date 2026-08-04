import type { LoaderFunctionArgs } from 'react-router';
import { readLocalAssignmentPromptAttachment } from '~/domain/assignments/assignment-prompt-attachment.server';
import { getSignedGetUrl } from '~/services/s3.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const assignmentId = params.assignmentId;
  if (!assignmentId) throw new Response('Not Found', { status: 404 });

  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  const access = profile.isOrgOwner
    ? {
        classAssignments: {
          some: {
            class: {
              school: { organizationId: profile.organization.id },
            },
          },
        },
      }
    : profile.role === 'STUDENT'
      ? {
          documents: {
            some: { membershipId: profile.id, deletedAt: null },
          },
        }
      : profile.role === 'TEACHER'
        ? {
            classAssignments: {
              some: { class: { teachers: { some: { id: profile.id } } } },
            },
          }
        : {
            classAssignments: {
              some: { class: { teachers: { some: { id: profile.id } } } },
            },
          };

  const assignment = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      promptAttachmentKey: { not: null },
      ...access,
    },
    select: {
      promptAttachmentKey: true,
      promptAttachmentName: true,
    },
  });

  if (!assignment?.promptAttachmentKey) {
    throw new Response('Not Found', { status: 404 });
  }

  const localPdf = await readLocalAssignmentPromptAttachment(
    assignment.promptAttachmentKey
  );
  if (localPdf) {
    return new Response(new Uint8Array(localPdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${(
          assignment.promptAttachmentName ?? 'assignment.pdf'
        ).replace(/["\r\n]/g, '_')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  const url = await getSignedGetUrl(assignment.promptAttachmentKey, 300);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Cache-Control': 'private, no-store',
    },
  });
}
