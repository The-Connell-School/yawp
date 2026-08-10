/**
 * A lesson's slide deck as a PowerPoint download.
 *
 * A resource route with no component, and a sibling of `packet.pdf`: same
 * loader, so the same access check, ordering and titles decide what comes back.
 * `?section=` names which deck when a lesson holds more than one; without it,
 * the packet's first deck is what "the slides" means.
 */
import type { LoaderFunctionArgs } from 'react-router';
import { loadLessonPacket } from '~/domain/lesson-planner/load-lesson-packet.server';
import { findDeckSection } from '~/domain/lesson-planner/lesson-packet';
import {
  pptxFilename,
  renderDeckPptx,
} from '~/domain/lesson-planner/lesson-pptx.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { packet } = await loadLessonPacket({
    request,
    conversationId: params.conversationId,
  });

  const url = new URL(request.url);
  const found = findDeckSection(packet, url.searchParams.get('section'));
  // No deck to hand over, or a section that is not one. Either way there is no
  // file here — better a 404 than an empty presentation.
  if (!found) throw new Response('Not Found', { status: 404 });

  const pptx = await renderDeckPptx(found.deck);
  const filename = pptxFilename(found.deck.title || found.section.title);

  return new Response(pptx as unknown as BodyInit, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // filename* carries the non-ASCII a lesson name really can contain — an
      // en dash, a curly apostrophe — which plain filename= cannot.
      'Content-Disposition': `attachment; filename="${filename.replace(
        /[^\x20-\x7e]/g,
        '_'
      )}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(pptx.byteLength),
      // A teacher's lesson is theirs; nothing in between should hold a copy.
      'Cache-Control': 'private, no-store',
    },
  });
}
