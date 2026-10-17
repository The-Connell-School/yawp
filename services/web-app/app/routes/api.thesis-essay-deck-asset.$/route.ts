import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { THESIS_ESSAY_DECKS_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { deckAssetContentType, isDeckAssetName } from '~/domain/thesis-essay-decks/thesis-essay-decks';
import { readThesisEssayDeckAsset } from '~/domain/thesis-essay-decks/thesis-essay-decks.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';

/**
 * An image or icon a Thesis-Driven Essay deck draws, for the on-site
 * presenter. The same gate as the decks themselves: teachers only, only
 * while the flag is on, and only a plain file name from the asset folder;
 * anything else is a 404.
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

  const name = params['*'] ?? '';
  invariantResponse(isDeckAssetName(name), 'Not found', { status: 404 });
  const bytes = await readThesisEssayDeckAsset(name);
  invariantResponse(bytes, 'Not found', { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': deckAssetContentType(name),
      'Content-Length': bytes.byteLength.toString(),
      // Behind a session and a flag, so never in a shared cache.
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
