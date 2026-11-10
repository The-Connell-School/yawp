import { howItWorksGuideFor } from './how-it-works-guide';
import { EXIT_TICKET_ASSIGNMENT_TYPE_KIND } from './exit-ticket';
import { isWritingStepKind } from '~/routes/app.assignment-types.$id/about-writing-step/content';

export function assignmentTypeHowItWorksPath(assignmentTypeId: string) {
  return `/app/assignment-types/${assignmentTypeId}/how-it-works`;
}

export function assignmentTypeHasHowItWorksGuide(
  assignmentType: {
    title: string;
    kind: string | null;
  },
  options: {
    /**
     * The Exit Ticket guide is new with Brian's landing pages and sits behind
     * the same flag (`assignment-type-landing-v2`). Off: no guide, as before.
     */
    exitTicketGuide?: boolean;
  } = {}
): boolean {
  if (isWritingStepKind(assignmentType.kind)) return true;
  if (assignmentType.kind === EXIT_TICKET_ASSIGNMENT_TYPE_KIND) {
    return options.exitTicketGuide === true;
  }
  const guide = howItWorksGuideFor(assignmentType.title);
  // Daily Pages is named in howItWorksGuideFor, but this route only renders
  // Class Starter, the thesis essay, the writing-step and Exit Ticket guides.
  // A button for Daily Pages would open a page that redirects home.
  return guide === 'class-starter' || guide === 'thesis-essay';
}
