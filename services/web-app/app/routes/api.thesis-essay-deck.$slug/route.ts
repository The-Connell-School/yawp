import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { THESIS_ESSAY_DECKS_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { PPTX_CONTENT_TYPE, deckBySlug } from '~/domain/thesis-essay-decks/thesis-essay-decks';
import { readThesisEssayDeck } from '~/domain/thesis-essay-decks/thesis-essay-decks.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';

/**
 * A Thesis-Driven Essay lesson deck, for a teacher to download from the
 * assignment type's Modules. Teachers only, and only while the flag is on;
 * anything else is a 404, as if the route did not exist.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  invariantResponse(profile.role === 'TEACHER', 'Not found', { status: 404 });
  invariantResponse(
    await isFeatureFlagEnabled(THESIS_ESSAY_DECKS_FLAG, profile.organization.id),
    'Not found',
    { status: 404 }
  );

  const deck = params.slug ? deckBySlug(params.slug) : null;
  invariantResponse(deck, 'Not found', { status: 404 });
  const bytes = await readThesisEssayDeck(deck);
  invariantResponse(bytes, 'Not found', { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': PPTX_CONTENT_TYPE,
      'Content-Length': bytes.byteLength.toString(),
      'Content-Disposition': `attachment; filename="${deck.downloadName}"`,
      // Behind a session and a flag, so never in a shared cache.
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
