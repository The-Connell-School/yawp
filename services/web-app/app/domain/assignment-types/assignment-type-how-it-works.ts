import { howItWorksGuideFor } from './how-it-works-guide';
import { isWritingStepKind } from '~/routes/app.assignment-types.$id/about-writing-step/content';

export function assignmentTypeHowItWorksPath(assignmentTypeId: string) {
  return `/app/assignment-types/${assignmentTypeId}/how-it-works`;
}

export function assignmentTypeHasHowItWorksGuide(assignmentType: {
  title: string;
  kind: string | null;
}): boolean {
  if (isWritingStepKind(assignmentType.kind)) return true;
  return howItWorksGuideFor(assignmentType.title) !== null;
}
