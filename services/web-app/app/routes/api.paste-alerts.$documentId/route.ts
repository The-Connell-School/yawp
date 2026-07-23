import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data as dataResponse,
} from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { buildTeacherClassWorkDocumentWhere } from '~/utils/class-assignment-scope.server';
import { boundPasteAlertContent } from '~/utils/paste-alert-constraints';

export const MAX_ALERTS_RETURNED = 200;

async function loadAuthorizedDocumentId(request: Request, documentId: string) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'TEACHER') {
    return { authorized: false as const };
  }

  const classes = await prisma.class.findMany({
    where: {
      teachers: { some: { id: profile.id } },
      school: { organizationId: profile.organization.id },
    },
    select: { id: true },
  });
  const classIds = classes.map((klass) => klass.id);

  const legacyDocumentIds = (
    await prisma.documentClassForensic.findMany({
      where: { oldClassId: { in: classIds } },
      select: { documentId: true },
    })
  ).map((row) => row.documentId);

  const documentWhere = buildTeacherClassWorkDocumentWhere({
    classIds,
    legacyDocumentIds,
  });

  const document = await prisma.document.findFirst({
    where: {
      ...documentWhere,
      id: documentId,
      membership: { organizationId: profile.organization.id },
    },
    select: {
      id: true,
      title: true,
      membership: {
        select: { user: { select: { name: true, email: true } } },
      },
    },
  });

  if (!document) {
    return { authorized: false as const };
  }

  return { authorized: true as const, profile, document };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const documentId = params.documentId;
  if (!documentId) {
    return dataResponse({ error: 'Document is required' }, { status: 400 });
  }

  const result = await loadAuthorizedDocumentId(request, documentId);
  if (!result.authorized) {
    return dataResponse({ error: 'Not found' }, { status: 404 });
  }

  const alerts = await prisma.pasteAlert.findMany({
    where: { documentId },
    select: {
      id: true,
      createdAt: true,
      textLength: true,
      content: true,
      reviewedAt: true,
      reviewedByMembership: {
        select: { user: { select: { name: true, email: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_ALERTS_RETURNED + 1,
  });

  return dataResponse({
    document: result.document,
    alerts: alerts.slice(0, MAX_ALERTS_RETURNED).map((alert) => ({
      ...alert,
      ...boundPasteAlertContent(alert.content),
    })),
    hasMore: alerts.length > MAX_ALERTS_RETURNED,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return dataResponse({ error: 'Method not allowed' }, { status: 405 });
  }

  const documentId = params.documentId;
  if (!documentId) {
    return dataResponse({ error: 'Document is required' }, { status: 400 });
  }

  const result = await loadAuthorizedDocumentId(request, documentId);
  if (!result.authorized) {
    return dataResponse({ error: 'Not found' }, { status: 404 });
  }

  const formData = await request.formData();
  const alertId = formData.get('alertId')?.toString();
  if (!alertId) {
    return dataResponse({ error: 'Alert is required' }, { status: 400 });
  }

  const alert = await prisma.pasteAlert.findFirst({
    where: { id: alertId, documentId },
    select: { id: true },
  });
  if (!alert) {
    return dataResponse({ error: 'Alert not found' }, { status: 404 });
  }

  await prisma.pasteAlert.updateMany({
    where: { id: alertId, documentId, reviewedAt: null },
    data: {
      reviewedAt: new Date(),
      reviewedByMembershipId: result.profile.id,
    },
  });

  return dataResponse({ success: true });
}
