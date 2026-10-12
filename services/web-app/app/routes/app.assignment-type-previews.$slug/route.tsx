/**
 * A free classroom teacher's look at an assignment type their plan doesn't
 * include: the type's "See how it works" guide, opened from its grayed-out
 * tile on the dashboard. See docs/free-tier/locked-assignment-types.md.
 *
 * It lives outside /app/free-tier on purpose: the app shell renders that
 * prefix as the bare onboarding shell, and a teaser should sit in the app
 * with the sidebar like any other page.
 */
import { Lock } from 'lucide-react';
import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { ApHistoryGuide } from '~/components/how-it-works/ap-history-guide';
import { ThesisEssayGuide } from '~/components/how-it-works/thesis-essay-guide';
import { isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';
import {
  findLockedAssignmentTypeTeaser,
  lockedAssignmentTypeTeasersAvailable,
} from '~/domain/free-tier/locked-assignment-types';
import { requireMembership, requireUserId } from '~/utils/auth.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  const available = lockedAssignmentTypeTeasersAvailable({
    freeTierEnabled: await isFreeTierEnabled(),
    role: membership.role,
    plan: membership.organization.plan,
  });
  const teaser = findLockedAssignmentTypeTeaser(params.slug);
  if (!available || !teaser) {
    throw new Response('Not found', { status: 404 });
  }
  return { slug: teaser.slug };
}

function LockedTypeBanner() {
  return (
    <div
      data-testid="locked-type-banner"
      className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
    >
      <Lock size={18} className="mt-0.5 shrink-0 text-primary" />
      <p className="text-sm leading-relaxed">
        <strong>Included with a paid plan.</strong>{' '}
        <span className="text-muted-foreground">
          Your free classroom has Class Starter, Prewriting, and Thesis
          Statement. Here is a look at what a paid plan adds.
        </span>
      </p>
    </div>
  );
}

export default function AssignmentTypePreviewRoute() {
  const { slug } = useLoaderData<typeof loader>();
  const frame = {
    backTo: '/app',
    backLabel: 'Back to dashboard',
    banner: <LockedTypeBanner />,
    startTo: '/app',
    startLabel: 'Back to dashboard',
  };
  return slug === 'ap-history-essay' ? (
    <ApHistoryGuide {...frame} />
  ) : (
    <ThesisEssayGuide {...frame} />
  );
}
