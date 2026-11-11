/**
 * A deck as a PowerPoint download.
 *
 * A resource route with no component, sitting beside the presenter and reached
 * by the same id — so anything a teacher can project, they can also take with
 * them, whether or not it has been filed in a packet yet.
 *
 * Yawp projects decks perfectly well; this is for when the deck has to leave.
 * The classroom desktop nobody is logged into, the substitute who needs
 * Tuesday's slides, the colleague borrowing the lesson, the teacher who wants
 * to add two slides of their own.
 */
import { withDeckKit } from '~/domain/lesson-planner/deck-kit-v4';
import type { LoaderFunctionArgs } from 'react-router';
import { loadLessonDeck } from '~/domain/lesson-planner/load-deck.server';
import {
  pptxFilename,
  renderDeckPptx,
} from '~/domain/lesson-planner/lesson-pptx.server';
import { renderDeckPptxTile } from '~/domain/lesson-planner/lesson-pptx-tile.server';
import { renderDeckPptxGallery } from '~/domain/lesson-planner/lesson-pptx-gallery.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { loadDeckPictureFiles } from '~/domain/lesson-planner/deck-pictures.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { deck, lessonTitle } = await loadLessonDeck({
    request,
    conversationId: params.conversationId,
    deckId: params.messageId,
  });

  // Brian's review (E1): the Yawp! tile template, behind its flag.
  const access = await getLessonPlannerAccess(request);
  const { deckV2, deckGallery, deckKitV4 } = access.allowed
    ? await getLessonPlannerReviewFlags(access.membership.organization.id)
    : { deckV2: false, deckGallery: false, deckKitV4: false };
  // The teacher's own pictures go in the file with the deck (Nov 1).
  const pictures = await loadDeckPictureFiles([deck], access.allowed ? access.membership.id : null);
  // The Lesson Deck Kit, behind its own flag.
  const pptx = deckGallery
    ? await renderDeckPptxGallery(withDeckKit(deck, { deckKitV4 }), { pictures })
    : deckV2
    ? await renderDeckPptxTile(deck, { pictures })
    : await renderDeckPptx(deck, { pictures });
  const filename = pptxFilename(deck.title || lessonTitle);

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
