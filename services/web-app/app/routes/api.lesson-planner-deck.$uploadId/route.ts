/**
 * A teacher's own deck, back exactly as they uploaded it (Nov 1): the file
 * they teach from when they choose "Add my existing slide deck to the stack
 * as is". Only theirs, and only a deck that was kept whole.
 */
import { data, type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';

const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** An ASCII fallback for old clients and the exact name for everyone else. */
function disposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '').trim() || 'deck.pptx';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const access = await requireLessonPlannerAccess(request);
  const upload = params.uploadId
    ? await prisma.lessonPlanUpload.findFirst({
        where: { id: params.uploadId, membershipId: access.membership.id, file: { not: null } },
        select: { name: true, file: true },
      })
    : null;
  if (!upload?.file) throw data('Not found', { status: 404 });
  const name = /\.pptx$/i.test(upload.name) ? upload.name : `${upload.name}.pptx`;

  return new Response(upload.file as unknown as BodyInit, {
    headers: {
      'Content-Type': PPTX,
      'Content-Length': String(upload.file.byteLength),
      'Content-Disposition': disposition(name),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
