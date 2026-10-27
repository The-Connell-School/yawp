import { redirect } from 'react-router';
import {
  assignmentTypeHasHowItWorksGuide,
  assignmentTypeHowItWorksPath,
} from '~/domain/assignment-types/assignment-type-how-it-works';
import { userHasPendingFreeTierTeachingLock } from './locked-preview.server';

/** Oct 26: pending teachers browse How It Works only, not the assignment homepage. */
export async function redirectLockedPreviewAssignmentTypeHomeToGuide(args: {
  userId: string;
  assignmentType: { id: string; title: string; kind: string | null };
}) {
  if (!(await userHasPendingFreeTierTeachingLock(args.userId))) return;
  if (!assignmentTypeHasHowItWorksGuide(args.assignmentType)) {
    throw redirect('/app');
  }
  throw redirect(assignmentTypeHowItWorksPath(args.assignmentType.id));
}
