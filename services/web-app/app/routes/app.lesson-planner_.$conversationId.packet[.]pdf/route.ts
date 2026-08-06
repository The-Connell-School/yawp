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
  printsForStudents,
  renderHandoutPdf,
  renderPacketPdf,
} from '~/domain/lesson-planner/lesson-pdf.server';
import { buildStudentHandout } from '~/domain/lesson-planner/student-handout';

/** Guards against a hand-edited URL asking us to allocate for nothing. */
const MAX_EXCLUSIONS = 200;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { packet } = await loadLessonPacket({
    request,
    conversationId: params.conversationId,
  });

  const url = new URL(request.url);
  const wantsHandout = url.searchParams.get('view') === 'handout';
  const onlySection = url.searchParams.get('section');
  // A single handout PIECE, as opposed to a whole section: a teacher who
  // wants their handouts kept separate rather than combined into one long
  // document downloads them this way, one click per piece. Distinct from
  // `section` because a piece can be material nested inside a kept reply,
  // which has no section of its own to be found by id.
  const onlyPiece = url.searchParams.get('piece');
  // The teacher's exclusions live in the page's state, so they travel in the
  // link — the downloaded handout has to match the one on screen.
  const excluded = (url.searchParams.get('exclude') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_EXCLUSIONS);

  if (onlyPiece) {
    const piece = buildStudentHandout({ packet }).parts.find(
      (part) => part.id === onlyPiece
    );
    if (!piece) throw new Response('Not Found', { status: 404 });

    const pdf = await renderHandoutPdf({ packet, only: onlyPiece });
    return pdfResponse(pdf, pdfFilename(packet.title, piece.title));
  }

  // One resource on its own: a teacher wants the handout, or just the warm-up,
  // far more often than they want the whole packet.
  const single = onlySection
    ? packet.sections.find((section) => section.id === onlySection)
    : undefined;
  if (onlySection && !single) {
    throw new Response('Not Found', { status: 404 });
  }

  // Exclusions are dropped when one piece was asked for by name: the teacher
  // pointed at that piece, so leaving it out would answer with nothing.
  const chosen = single ? { ...packet, sections: [single] } : packet;
  const pdf = printsForStudents({
    wantsHandout,
    singleSectionAudience: single?.audience,
  })
    ? await renderHandoutPdf({
        packet: chosen,
        excluded: single ? [] : excluded,
      })
    : await renderPacketPdf(chosen);

  const filename = pdfFilename(
    packet.title,
    wantsHandout ? 'Student handout' : single?.title
  );

  return pdfResponse(pdf, filename);
}

function pdfResponse(pdf: Uint8Array, filename: string): Response {
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
