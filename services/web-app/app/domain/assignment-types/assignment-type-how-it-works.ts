import { SITE_LICENSE_LOCKED_TILE_LABELS } from '~/domain/free-tier/site-license-locked-assignment-tiles';
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
  const guide = howItWorksGuideFor(assignmentType.title);
  return guide === 'class-starter' || guide === 'thesis-essay';
}

/** Site-license carousel tiles use keys, not assignment type titles. */
export function siteLicenseLockedTileHasHowItWorksGuide(tileKey: string) {
  return tileKey in SITE_LICENSE_LOCKED_TILE_LABELS;
}
