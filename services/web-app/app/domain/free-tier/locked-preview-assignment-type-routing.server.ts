import { redirect } from 'react-router';
import {
  assignmentTypeHasHowItWorksGuide,
  assignmentTypeHowItWorksPath,
} from '~/domain/assignment-types/assignment-type-how-it-works';
import { assignmentTypeMatchesSiteLicenseLockedTile } from '~/domain/free-tier/site-license-locked-assignment-tiles';
import { userHasPendingFreeTierTeachingLock } from './locked-preview.server';

/** Oct 26: pending teachers browse How It Works only, not the assignment homepage. */
export async function redirectLockedPreviewAssignmentTypeHomeToGuide(args: {
  userId: string;
  assignmentType: {
    id: string;
    title: string;
    kind: string | null;
    systemKey?: string | null;
  };
}) {
  if (!(await userHasPendingFreeTierTeachingLock(args.userId))) return;
  const hasGuide =
    assignmentTypeHasHowItWorksGuide(args.assignmentType) ||
    assignmentTypeMatchesSiteLicenseLockedTile({
      title: args.assignmentType.title,
      kind: args.assignmentType.kind,
      systemKey: args.assignmentType.systemKey ?? null,
    });
  if (!hasGuide) {
    throw redirect('/app');
  }
  throw redirect(assignmentTypeHowItWorksPath(args.assignmentType.id));
}
