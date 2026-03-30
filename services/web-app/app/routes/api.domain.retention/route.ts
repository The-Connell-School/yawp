import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { prisma } from '~/utils/db.server';

const DEFAULT_DOCUMENT_RETENTION_DAYS = 3;

function assertInternalToken(request: Request) {
  const token =
    new URL(request.url).searchParams.get('token') ||
    request.headers.get('x-internal-token');
  if (!token || token !== process.env.INTERNAL_COMMAND_TOKEN) {
    return false;
  }
  return true;
}

function getRetentionDays(envVarName: string, fallback: number) {
  const rawValue = process.env[envVarName];
  if (!rawValue) return fallback;

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export async function loader({ request }: ActionFunctionArgs) {
  if (!assertInternalToken(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const documentRetentionDays = getRetentionDays(
    'DOCUMENT_VERSION_RETENTION_DAYS',
    DEFAULT_DOCUMENT_RETENTION_DAYS
  );
  const documentWriteJournalRetentionDays = getRetentionDays(
    'DOCUMENT_WRITE_JOURNAL_RETENTION_DAYS',
    DEFAULT_DOCUMENT_RETENTION_DAYS
  );

  const cutoffVersions = new Date(now.getTime() - documentRetentionDays * oneDay);
  const cutoffDocumentWriteJournals = new Date(
    now.getTime() - documentWriteJournalRetentionDays * oneDay
  );

  const versionsResult = await prisma.documentVersion.deleteMany({
    where: { createdAt: { lt: cutoffVersions } },
  });
  const documentWriteJournalsResult = await prisma.documentWriteJournal.deleteMany({
    where: { createdAt: { lt: cutoffDocumentWriteJournals } },
  });

  return dataResponse({
    deletedVersions: versionsResult.count,
    deletedSnapshots: 0,
    deletedDocumentWriteJournals: documentWriteJournalsResult.count,
  });
}

export const action = loader;
