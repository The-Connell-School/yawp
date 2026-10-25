/**
 * The slide deck as a PDF (Oct 24 handoff, task 4: Print it for class ›
 * Slide deck › PDF): every slide with its notes. The deck is the one in the
 * stack, or the newest one built for the lesson.
 */
import type { LoaderFunctionArgs } from 'react-router';
import { loadLessonPacket } from '~/domain/lesson-planner/load-lesson-packet.server';
import { lessonDeck } from '~/domain/lesson-planner/lesson-deck.server';
import { pdfFilename, renderSlidesPdf } from '~/domain/lesson-planner/lesson-pdf.server';
import { slidesPerPage } from '~/domain/lesson-planner/one-packet';

export async function loader({ request, params }: LoaderFunctionArgs) {
  // Access first: the teacher's own lesson, or not found.
  const { conversationId, packet } = await loadLessonPacket({
    request,
    conversationId: params.conversationId,
    withStackDetails: false,
  });
  const found = await lessonDeck(conversationId);
  if (!found) throw new Response('Not Found', { status: 404 });
  // 2 or 4 slides to a page (Brian's round 4, item 5); old links print 2.
  const perPage = slidesPerPage(new URL(request.url).searchParams.get('perPage') ?? '2');
  const pdf = await renderSlidesPdf({ lessonTitle: packet.title, deck: found.deck, perPage });
  const filename = pdfFilename(packet.title, 'Slides');
  return new Response(pdf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}
