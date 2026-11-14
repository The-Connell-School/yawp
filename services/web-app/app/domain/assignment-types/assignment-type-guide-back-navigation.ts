import { LOCKED_PREVIEW_APP_HOME } from '~/domain/free-tier/locked-preview';

export function assignmentTypeGuideBackNavigation(
  teachingLocked: boolean,
  assignmentTypePagePath: string,
  assignmentTypeTitle: string
) {
  if (teachingLocked) {
    return { backTo: LOCKED_PREVIEW_APP_HOME, backLabel: 'Back to home' };
  }
  return {
    backTo: assignmentTypePagePath,
    backLabel: `Back to ${assignmentTypeTitle}`,
  };
}
