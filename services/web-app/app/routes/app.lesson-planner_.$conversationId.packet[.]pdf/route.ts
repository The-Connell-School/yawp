/**
 * The lesson packet as a downloadable file.
 *
 * A resource route with no component: it answers with the PDF itself, so "Save
 * as PDF" is a link the browser downloads rather than a print dialog the
 * teacher has to steer. Access, ordering and titles come from the same loader
 * the packet page uses, so the file always matches the page it came from.
 */
import type { LoaderFunctionArgs } from 'react-router';
import { loadLessonPacket } from '~/domain/lesson-planner/load-lesson-packet.server';
import {
  pdfFilename,
  renderHandoutPdf,
  renderPacketPdf,
} from '~/domain/lesson-planner/lesson-pdf.server';

/** Guards against a hand-edited URL asking us to allocate for nothing. */
const MAX_EXCLUSIONS = 200;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { packet } = await loadLessonPacket({
    request,
    conversationId: params.conversationId,
  });

  const url = new URL(request.url);
  const wantsHandout = url.searchParams.get('view') === 'handout';
  // The teacher's exclusions live in the page's state, so they travel in the
  // link — the downloaded handout has to match the one on screen.
  const excluded = (url.searchParams.get('exclude') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_EXCLUSIONS);

  const pdf = wantsHandout
    ? await renderHandoutPdf({ packet, excluded })
    : await renderPacketPdf(packet);

  const filename = pdfFilename(
    packet.title,
    wantsHandout ? 'Student handout' : undefined
  );

  return new Response(pdf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      // filename* carries the non-ASCII a lesson name really can contain —
      // an en dash, a curly apostrophe — which plain filename= cannot.
      'Content-Disposition': `attachment; filename="${filename.replace(
        /[^\x20-\x7e]/g,
        '_'
      )}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(pdf.byteLength),
      // A teacher's lesson is theirs; nothing in between should hold a copy.
      'Cache-Control': 'private, no-store',
    },
  });
}
