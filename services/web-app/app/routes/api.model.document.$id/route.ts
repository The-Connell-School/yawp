import { createHash } from 'node:crypto';
import { invariant } from '@epic-web/invariant';
import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { documentReadWhere } from '~/utils/document-access.server';
import { hasEffectivePlatformAdmin } from '~/utils/preview-access.server';
import { buildTeacherDocumentAccessWhere } from '~/utils/grading-auth.server';
import {
  buildSubmissionBodyAuditMetadata,
  recordSubmissionActivity,
  resolveSubmissionActivityActorMembershipId,
  submissionActivityEventTypes,
} from '~/domain/submissions/submission-activity.server';

const PUT = z.object({
  text: z.string().optional(),
  html: z.string().optional(),
  title: z.string().optional(),
  editorSessionId: z.string().optional(),
  clientSeq: z.coerce.number().int().nonnegative().optional(),
  baseRevision: z.coerce.number().int().nonnegative().optional(),
});

class SubmissionSnapshotConflictError extends Error {}

function hashString(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function isRecordNotFoundError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025'
  );
}

const actionImpl = async ({ request, params }: ActionFunctionArgs) => {
  invariant(params.id, 'No id provided');
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const snapshotId = new URL(request.url).searchParams.get('snapshotId');

  let formData: FormData | null = null;

  if (request.method === 'POST') {
    formData = await request.formData();
    const actionType = formData.get('action');

    if (actionType === 'archive' || actionType === 'unarchive') {
      const updated = await prisma.document.update({
        where: { id: params.id, membershipId: profile.id },
        data: {
          archivedAt: actionType === 'archive' ? new Date() : null,
        },
      });

      if (!updated) {
        return new Response(null, { status: 404 });
      }
      return new Response(null, { status: 204 });
    }
  }

  if (request.method === 'DELETE') {
    const updated = await prisma.document.update({
      where: { id: params.id, membershipId: profile.id },
      data: { deletedAt: new Date() },
    });

    if (!updated) {
      return new Response(null, { status: 404 });
    } else {
      return new Response(null, { status: 204 });
    }
  }

  const fd = formData ?? (await request.formData());
  const { error, data } = await parseFormData(fd, PUT);
  if (error) return validationError(error);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { isAdmin: true },
  });

  // Resolve the document through the access predicate BEFORE anything is written.
  //
  // This used to be a bare `findUniqueOrThrow({ where: { id: params.id } })`, and
  // the only scoped query was the `document.update` at the very end. That ordering
  // refused the write while having already performed two others against a document
  // the caller has no claim on: a `documentWriteJournal` row stamped with the
  // caller's userId/membershipId but carrying the victim's current html and text
  // (`resolvedHtml` falls back to `document.html` when the body sends no content),
  // and a `documentRevision` appended to the victim's history. The final update
  // then threw P2025, which the catch below only handles on the stale-baseRevision
  // path, so the request 500'd and left the journal row `pending` forever.
  const document = await prisma.document.findFirst({
    where: {
      id: params.id,
      ...documentReadWhere({ profileId: profile.id, isAdmin: user.isAdmin }),
    },
  });

  if (!document) {
    return new Response(null, { status: 404 });
  }

  const source = new URL(request.url).searchParams.get('from') ?? 'unknown';
  const hasBodyMutation = data.html !== undefined || data.text !== undefined;
  const resolvedHtml = data.html ?? document.html ?? '';
  const resolvedText = data.text ?? document.text ?? '';
  const documentUpdateData: {
    html?: string;
    text?: string;
    title?: string;
    revision?: { increment: number };
  } = {};

  if (data.html !== undefined) documentUpdateData.html = data.html;
  if (data.text !== undefined) documentUpdateData.text = data.text;
  if (data.title !== undefined) documentUpdateData.title = data.title;
  if (hasBodyMutation) {
    documentUpdateData.revision = { increment: 1 };
  }

  const journal = await prisma.documentWriteJournal.create({
    data: {
      eventType: hasBodyMutation ? 'document.save' : 'document.title_update',
      source,
      status: 'pending',
      userId,
      membershipId: profile.id,
      editorSessionId: data.editorSessionId ?? null,
      clientSeq: data.clientSeq ?? null,
      baseRevision: data.baseRevision ?? null,
      documentId: document.id,
      title: data.title ?? document.title,
      html: resolvedHtml,
      text: resolvedText,
      htmlHash: hashString(resolvedHtml),
      textHash: hashString(resolvedText),
      metadata: {
        method: request.method,
        snapshotId,
      },
    },
  });

  if (data.editorSessionId && data.clientSeq !== undefined && hasBodyMutation) {
    const lastAccepted = await prisma.documentWriteJournal.findFirst({
      where: {
        documentId: document.id,
        editorSessionId: data.editorSessionId,
        status: 'accepted',
      },
      orderBy: [{ clientSeq: 'desc' }, { createdAt: 'desc' }],
      select: { clientSeq: true },
    });

    if (
      lastAccepted?.clientSeq !== null &&
      lastAccepted?.clientSeq !== undefined &&
      data.clientSeq <= lastAccepted.clientSeq
    ) {
      await prisma.documentWriteJournal.update({
        where: { id: journal.id },
        data: {
          status: 'rejected',
          failureReason: 'stale_client_sequence',
        },
      });

      return new Response(
        JSON.stringify({
          ok: false,
          error: 'stale_client_sequence',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (
      data.baseRevision !== undefined &&
      document.revision !== data.baseRevision
    ) {
      await prisma.documentWriteJournal.update({
        where: { id: journal.id },
        data: {
          status: 'rejected',
          failureReason: 'stale_base_revision',
        },
      });

      return new Response(
        JSON.stringify({
          ok: false,
          error: 'stale_base_revision',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  if (snapshotId) {
    const snapshotDocumentAccessWhere = hasEffectivePlatformAdmin(user.isAdmin)
      ? { deletedAt: null }
      : {
          deletedAt: null,
          ...buildTeacherDocumentAccessWhere({
            membershipId: profile.id,
            organizationId: profile.organization.id,
          }),
        };
    // snapshotId now refers to a Submission id
    const submission = await prisma.submission.findFirst({
      where: {
        id: snapshotId,
        documentId: document.id,
        document: { is: snapshotDocumentAccessWhere },
      },
      select: {
        id: true,
        text: true,
        html: true,
        updatedAt: true,
        releasedAt: true,
        document: {
          select: {
            membership: { select: { organizationId: true } },
          },
        },
      },
    });

    if (!submission) {
      return new Response(null, { status: 404 });
    }

    const submissionData: { html?: string; text?: string } = {};
    if (data.html !== undefined) submissionData.html = data.html;
    if (data.text !== undefined) submissionData.text = data.text;

    if (Object.keys(submissionData).length === 0) {
      await prisma.documentWriteJournal.update({
        where: { id: journal.id },
        data: {
          status: 'accepted',
          resultingRevision: document.revision,
        },
      });
      return new Response(
        JSON.stringify({ ok: true, revision: document.revision }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const previousBody = buildSubmissionBodyAuditMetadata({
      text: submission.text,
      html: submission.html,
    });
    const nextBody = buildSubmissionBodyAuditMetadata({
      text: submissionData.text ?? submission.text,
      html: submissionData.html ?? submission.html,
    });

    if (JSON.stringify(previousBody) !== JSON.stringify(nextBody)) {
      try {
        await prisma.$transaction(async (tx) => {
          const updated = await tx.submission.updateMany({
            where: {
              id: submission.id,
              documentId: document.id,
              updatedAt: submission.updatedAt,
              document: { is: snapshotDocumentAccessWhere },
            },
            data: { ...submissionData, updatedAt: new Date() },
          });
          if (updated.count !== 1) throw new SubmissionSnapshotConflictError();
          const organizationId =
            submission.document.membership.organizationId ??
            profile.organization.id;
          await recordSubmissionActivity(tx, {
            submissionId: submission.id,
            organizationId,
            actorMembershipId: resolveSubmissionActivityActorMembershipId({
              actorMembershipId: profile.id,
              actorOrganizationId: profile.organization.id,
              submissionOrganizationId: organizationId,
            }),
            actorUserId: userId,
            eventType: submissionActivityEventTypes.bodyUpdated,
            source: 'document-snapshot',
            occurredAfterRelease: submission.releasedAt != null,
            changes: {
              body: { before: previousBody, after: nextBody },
            },
          });
        });
      } catch (error) {
        if (error instanceof SubmissionSnapshotConflictError) {
          await prisma.documentWriteJournal.update({
            where: { id: journal.id },
            data: {
              status: 'rejected',
              failureReason: 'stale_submission_snapshot',
            },
          });
          return new Response(
            JSON.stringify({ ok: false, error: 'stale_submission_snapshot' }),
            { status: 409, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw error;
      }
    }

    await prisma.documentWriteJournal.update({
      where: { id: journal.id },
      data: {
        status: 'accepted',
        resultingRevision: document.revision,
      },
    });

    return new Response(
      JSON.stringify({ ok: true, revision: document.revision }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Throttled version + periodic durable snapshot strategy
  const now = new Date();
  const twentySecondsAgo = new Date(now.getTime() - 20_000);

  const lastVersion = await prisma.documentRevision.findFirst({
    where: { documentId: params.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  if (!lastVersion || lastVersion.createdAt < twentySecondsAgo) {
    await prisma.documentRevision.create({
      data: {
        documentId: params.id,
        text: document.text ?? '',
        html: document.html ?? '',
        trigger: 'auto-save',
      },
    });
  }

  let update;
  try {
    update = await prisma.document.update({
      where: {
        id: document.id,
        // Redundant now that the resolve above is scoped, and deliberately kept:
        // the predicate is what refuses the write, and it should not depend on a
        // lookup fifty lines earlier staying scoped.
        AND: [
          documentReadWhere({ profileId: profile.id, isAdmin: user.isAdmin }),
        ],
        ...(hasBodyMutation && data.baseRevision !== undefined
          ? { revision: data.baseRevision }
          : {}),
      },
      data: documentUpdateData,
    });
  } catch (error) {
    if (
      hasBodyMutation &&
      data.baseRevision !== undefined &&
      isRecordNotFoundError(error)
    ) {
      await prisma.documentWriteJournal.update({
        where: { id: journal.id },
        data: {
          status: 'rejected',
          failureReason: 'stale_base_revision',
        },
      });

      return new Response(
        JSON.stringify({
          ok: false,
          error: 'stale_base_revision',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    throw error;
  }

  // Create hourly durable snapshot in DB and S3 for point-in-time recovery
  try {
    const fresh = await prisma.document.findUnique({
      where: { id: document.id },
      select: { id: true, html: true, text: true },
    });

    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const lastSnapshot = await (prisma as any).documentSnapshot?.findFirst?.({
      where: { documentId: document.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const shouldSnapshot = !lastSnapshot || lastSnapshot.createdAt < oneHourAgo;

    if (shouldSnapshot && fresh?.html != null && fresh?.text != null) {
      await (prisma as any).documentSnapshot.create({
        data: {
          document: { connect: { id: document.id } },
          html: fresh.html,
          text: fresh.text,
        },
      });
    }
  } catch {
    // Snapshot creation is non-fatal
  }

  if (!update) {
    return new Response(null, { status: 404 });
  } else {
    await prisma.documentWriteJournal.update({
      where: { id: journal.id },
      data: {
        status: 'accepted',
        resultingRevision: update.revision,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        revision: update.revision,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

export async function action(args: ActionFunctionArgs) {
  return actionImpl(args);
}
