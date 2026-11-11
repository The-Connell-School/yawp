import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { THESIS_ESSAY_DECKS_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { materialBySlug } from '~/domain/thesis-essay-decks/thesis-essay-decks';
import { readThesisEssayMaterial } from '~/domain/thesis-essay-decks/thesis-essay-decks.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';

/**
 * A Thesis-Driven Essay lesson deck, its lesson plan, or a Day 1 student
 * handout (sign-up, sample essay), for a teacher to download from the assignment type's
 * Modules. Teachers only, and only while the flag is on;
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

  const material = params.slug ? materialBySlug(params.slug) : null;
  invariantResponse(material, 'Not found', { status: 404 });
  const bytes = await readThesisEssayMaterial(material);
  invariantResponse(bytes, 'Not found', { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': material.contentType,
      'Content-Length': bytes.byteLength.toString(),
      'Content-Disposition': `attachment; filename="${material.downloadName}"`,
      // Behind a session and a flag, so never in a shared cache.
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
