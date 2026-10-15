import { data, Link, type LoaderFunctionArgs, useLoaderData } from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { enforceFreeTierTeacherGate, loadFreeTierGateApplication } from '~/domain/free-tier/free-tier-gate.server';
import { isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';
import { assertFreeTierSpendAllowed, FreeTierSpendGuardDeniedError } from '~/domain/free-tier/usage-budget.server';
import { Button } from '~/components/ui/button';
import {
  FreeTierAuthCard,
  FreeTierSignOut,
} from '../free-tier/FreeTierAuthCard';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  await requireFreeTierEnabled();
  const application = await loadFreeTierGateApplication(userId);
  if (!application) throw data({ error: 'No free classroom application found.' }, { status: 404, headers: headers() });

  // Single-fetch requests must keep the same pending/onboarding gates as the
  // layout. Query parameters never select a teacher, organization or reason.
  await enforceFreeTierTeacherGate({ userId, pathname: '/app/free-tier/status', application });
  const respond = (state: 'trial-ended' | 'invite-expired' | 'rejected' | 'budget-paused' | 'available') => data({ state }, { headers: headers() });
  const terminal = application.status === 'EXPIRED' || application.status === 'REJECTED';
  if (!application.organizationId && terminal) {
    return respond(application.status === 'REJECTED' ? 'rejected' : 'invite-expired');
  }
  const membership = await requireMembership(request, userId);
  if (!membership.isActive || membership.role !== 'TEACHER' || membership.organization.plan !== 'FREE_CLASSROOM' || membership.organization.id !== application.organizationId) {
    throw data({ error: 'This status is available to the current free classroom teacher.' }, { status: 403, headers: headers() });
  }
  // Persisted terminal access decisions outrank a temporary budget pause.
  if (terminal) return respond(application.status === 'REJECTED' ? 'rejected' : 'trial-ended');
  if (application.status !== 'APPROVED') {
    throw data({ error: 'Free classroom access is not yet available.' }, { status: 409, headers: headers() });
  }

  // Same approval/plan/flag predicates as AI admission, then the existing spend
  // guard, with no parallel budget arithmetic. Unexpected failures propagate.
  if (await isFreeTierEnabled({ throwOnError: true })) {
    try {
      await assertFreeTierSpendAllowed();
    } catch (error) {
      if (error instanceof FreeTierSpendGuardDeniedError) return respond('budget-paused');
      throw error;
    }
  }
  return respond('available');
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

const content = {
  'trial-ended': {
    title: 'Your free classroom trial has ended',
    copy: 'Your free classroom application is marked expired, so classroom access is no longer available. Contact support to ask about next steps for your classroom.',
  },
  'invite-expired': {
    title: 'Invite expired',
    copy: 'Your free classroom invitation has expired. Contact support to ask for a new link.',
  },
  rejected: {
    title: 'Request not approved',
    copy: 'This request was not approved. Contact support if you have questions about the decision or next steps.',
  },
  'budget-paused': {
    title: 'Free classroom spending is paused',
    copy: 'This environment has reached its current free classroom budget. AI tools and other operations covered by the spending guard are paused. This is an environment limit, not a personal allowance or a permanent trial expiration.',
  },
  available: {
    title: 'Free classroom access',
    copy: 'Your free classroom application is approved. No environment budget pause is currently enforced for this classroom. Existing classroom limits still apply.',
  },
};

export default function FreeTierStatusRoute() {
  const { state } = useLoaderData<typeof loader>();
  const { title, copy } = content[state];
  const canRead = state === 'budget-paused' || state === 'available';
  return (
    <FreeTierAuthCard title={title}>
      <p className="text-sm text-muted-foreground">{copy}</p>
      {state === 'budget-paused' ? (
        <p className="text-sm text-muted-foreground">You can still read your existing classroom work. Check again later or contact support about the pause.</p>
      ) : null}
      <Button variant="outline" asChild><a href="mailto:support@yawp.school">Contact support</a></Button>
      {canRead ? (
        <>
          <Button asChild><Link to="/app/my-classes">Back to My Classes</Link></Button>
          <Link to="/app/classroom-report" className="text-sm underline">Open activity report</Link>
          <Link to="/app/pitch-packet" className="text-sm underline">Open trial pitch packet</Link>
          <Link to="/app/free-tier/status" reloadDocument className="text-sm underline">Check again</Link>
        </>
      ) : null}
      <FreeTierSignOut />
    </FreeTierAuthCard>
  );
}
