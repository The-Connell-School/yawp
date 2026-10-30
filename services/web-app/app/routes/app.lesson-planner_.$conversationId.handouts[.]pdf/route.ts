/**
 * The student handout for the steps the teacher picked (Brian's run 3, item
 * 8): each written for students, with lines to write on. `ids` picks the
 * steps, in stack order; `inline=1` opens it to print rather than download.
 */
import type { LoaderFunctionArgs } from 'react-router';
import { loadHandoutParts } from '~/domain/lesson-planner/load-step-handouts.server';
import { pdfFilename, renderStepHandoutPdf } from '~/domain/lesson-planner/lesson-pdf.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const { handouts, parts, wantedOne } = await loadHandoutParts({ request, conversationId: params.conversationId });
  if (wantedOne && !parts.length) throw new Response('Not Found', { status: 404 });
  // Nothing to print is said, not saved as an empty PDF (Kevin, Oct 25, note 11).
  if (!parts.length) return nothingToPrint();

  const pdf = await renderStepHandoutPdf({
    title: handouts.title,
    className: handouts.className,
    parts,
    kit: handouts.kit,
  });
  const filename = pdfFilename(handouts.title, parts.length === 1 ? parts[0]!.title : 'Student handout');
  const disposition = url.searchParams.get('inline') === '1' ? 'inline' : 'attachment';
  return new Response(pdf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}

function nothingToPrint() {
  return new Response('Pick the steps that go in the handout first.', {
    status: 409,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
