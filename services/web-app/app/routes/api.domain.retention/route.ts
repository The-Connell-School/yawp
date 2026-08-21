import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { prisma } from '~/utils/db.server';

/** DocumentRevision and DocumentWriteJournal rows older than this are deleted by the daily job. */
const DOCUMENT_REVISION_AND_WRITE_JOURNAL_RETENTION_DAYS = 30;

/**
 * The internal token is accepted from the `x-internal-token` header only.
 *
 * It used to also be read from `?token=`. A query string is copied into access
 * logs, proxy logs, browser history and `Referer` headers, so that form leaks a
 * credential whose possession `deleteMany`s every DocumentRevision and
 * DocumentWriteJournal older than 30 days — the same tables the recovery story
 * depends on. The only production caller is the EventBridge API destination in
 * `infra/main.tf`, whose connection already sets `x-internal-token`, so nothing
 * has to change on the calling side.
 */
function assertInternalToken(request: Request) {
  const token = request.headers.get('x-internal-token');
  if (!token || token !== process.env.INTERNAL_COMMAND_TOKEN) {
    return false;
  }
  return true;
}

export async function loader({ request }: ActionFunctionArgs) {
  if (!assertInternalToken(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const cutoff = new Date(
    now.getTime() -
      DOCUMENT_REVISION_AND_WRITE_JOURNAL_RETENTION_DAYS * oneDay
  );

  const versionsResult = await prisma.documentRevision.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  const documentWriteJournalsResult = await prisma.documentWriteJournal.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return dataResponse({
    deletedVersions: versionsResult.count,
    deletedSnapshots: 0,
    deletedDocumentWriteJournals: documentWriteJournalsResult.count,
  });
}

export const action = loader;
