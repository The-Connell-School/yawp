/**
 * The student handouts as Word (Oct 24 handoff, task 4): the same steps,
 * written for students, as the handouts PDF.
 */
import type { LoaderFunctionArgs } from 'react-router';
import { loadHandoutParts } from '~/domain/lesson-planner/load-step-handouts.server';
import { renderHandoutDocx } from '~/domain/lesson-planner/handout-docx.server';
import { pdfFilename } from '~/domain/lesson-planner/lesson-pdf.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { handouts, parts, wantedOne } = await loadHandoutParts({ request, conversationId: params.conversationId });
  if (wantedOne && !parts.length) throw new Response('Not Found', { status: 404 });
  const docx = await renderHandoutDocx({ title: handouts.title, className: handouts.className, parts });
  const filename = pdfFilename(handouts.title, parts.length === 1 ? parts[0]!.title : 'Student handout').replace(/\.pdf$/, '.docx');
  return new Response(new Uint8Array(docx) as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(docx.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}
