/**
 * Where a map slide's places are (Nov 19), for the deck studio: a teacher
 * renames a place on the slide, and its pin moves to the place of that name,
 * or comes off the map when Yawp! has no such place. The page sends the one
 * slide; the answer is its places as Yawp! found them and the area to show.
 * Nothing is saved here, and saving finds them again.
 */
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { requireMutableRequest } from '~/utils/auth.server';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { resolveDeckPlaces } from '~/domain/lesson-planner/context-slides.server';
import { validateSlideDeck } from '~/domain/lesson-planner/slide-deck';
import { readBoundedBytes } from '~/utils/bounded-body.server';

const MAX_BODY_BYTES = 32 * 1024;

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const access = await requireLessonPlannerAccess(request);
  const flags = await getLessonPlannerReviewFlags(access.membership.organization.id);
  if (!flags.deckStudio) return dataResponse({ error: 'Not found.' }, { status: 404 });

  const bytes = await readBoundedBytes(request, MAX_BODY_BYTES);
  if (bytes === null) return dataResponse({ error: 'That is too much for one slide.' }, { status: 413 });
  const slide = new URLSearchParams(new TextDecoder().decode(bytes)).get('slide') ?? '';
  // One slide, held to the rules any slide meets.
  const checked = validateSlideDeck(`{"title":"Places","slides":[${slide || 'null'}]}`);
  if (!checked.ok || checked.deck.slides[0]!.layout !== 'map') return dataResponse({ error: 'Not a map slide.' }, { status: 422 });

  const found = resolveDeckPlaces(checked.deck).slides[0]!;
  return dataResponse({ ok: true, places: found.places ?? [], view: found.view ?? null });
}
