import { data, type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { snapshotPasteEventIds } from '~/components/teacher-paste-report/snapshot-events.server';
import {
  getGradingActor,
  buildTeacherDocumentAccessWhere,
} from '~/utils/grading-auth.server';
const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const missing = () =>
  data({ error: 'Not found' }, { status: 404, headers: privateHeaders });

/** Teacher observations have a narrower boundary than ordinary document reads:
 * no owner/co-author path, and current work must belong to the teacher's class.
 * Never return raw paste contents or use an unscoped event ID lookup.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const actor = await getGradingActor(request);
  if (!actor.isTeacher && !actor.isAdmin) return missing();
  const params = new URL(request.url).searchParams;
  const documentId = params.get('documentId');
  const submissionId = params.get('submissionId');
  const cursor = params.get('cursor');
  if (
    Boolean(documentId) === Boolean(submissionId) ||
    [documentId, submissionId, cursor].some(
      (id) => id != null && id.length > 200
    )
  ) {
    return data(
      { error: 'Choose one document or submission' },
      { status: 400, headers: privateHeaders }
    );
  }
  const access = {
    deletedAt: null,
    artifactKind: 'STUDENT' as const,
    membership: { is: { userId: { not: actor.userId } } },
    ...buildTeacherDocumentAccessWhere({
      membershipId: actor.membershipId,
      organizationId: actor.organizationId,
      isAdmin: actor.isAdmin,
    }),
  };
  let id: string;
  let submittedAt: Date | undefined;
  let snapshotIds: string[] = [];
  if (submissionId) {
    const submission = await prisma.submission.findFirst({
      where: { id: submissionId, document: { is: access } },
      select: { documentId: true, submittedAt: true, html: true },
    });
    if (!submission) return missing();
    id = submission.documentId;
    submittedAt = submission.submittedAt;
    snapshotIds = snapshotPasteEventIds(submission.html);
  } else {
    const document = await prisma.document.findFirst({
      where: { id: documentId!, ...access },
      select: { id: true },
    });
    if (!document) return missing();
    id = document.id;
  }
  const eventScope = {
    documentId: id,
    ...(submittedAt
      ? snapshotIds.length > 0
        ? {
            // The event POST may finish after submission. Its persisted snapshot
            // mark proves membership in this version; later draft IDs do not.
            OR: [
              { createdAt: { lte: submittedAt } },
              { id: { in: snapshotIds } },
            ],
          }
        : { createdAt: { lte: submittedAt } }
      : {}),
  };
  if (
    cursor &&
    !(await prisma.pasteAlert.findFirst({
      where: { id: cursor, ...eventScope },
      select: { id: true },
    }))
  )
    return missing();
  const events = await prisma.pasteAlert.findMany({
    where: eventScope,
    select: { id: true, textLength: true, createdAt: true, sourceUrl: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: 101,
  });
  return data(
    {
      events: events.slice(0, 100),
      nextCursor: events.length > 100 ? events[99].id : null,
    },
    { headers: privateHeaders }
  );
}
