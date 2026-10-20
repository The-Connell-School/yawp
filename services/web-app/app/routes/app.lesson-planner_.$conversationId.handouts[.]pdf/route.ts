/**
 * The student handout for the steps the teacher picked (Brian's run 3, item
 * 8): each written for students, with lines to write on. `ids` picks the
 * steps, in stack order; `inline=1` opens it to print rather than download.
 */
import type { LoaderFunctionArgs } from 'react-router';
import { loadStepHandouts } from '~/domain/lesson-planner/load-step-handouts.server';
import { pdfFilename, renderStepHandoutPdf } from '~/domain/lesson-planner/lesson-pdf.server';

const MAX_IDS = 200;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const handouts = await loadStepHandouts({ request, conversationId: params.conversationId });
  const url = new URL(request.url);
  const asked = url.searchParams.get('ids');
  const wanted = asked
    ? new Set(asked.split(',').map((id) => id.trim()).filter(Boolean).slice(0, MAX_IDS))
    : null;
  const parts = handouts.steps
    .filter((step) => (wanted ? wanted.has(step.id) : step.included) && step.content)
    .map((step) => ({ id: step.id, title: step.title, content: step.content!, lines: step.lines }));
  if (wanted && wanted.size === 1 && !parts.length) throw new Response('Not Found', { status: 404 });

  const pdf = await renderStepHandoutPdf({
    title: handouts.title,
    className: handouts.className,
    parts,
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
