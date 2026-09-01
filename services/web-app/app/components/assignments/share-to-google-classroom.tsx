import { Button } from '~/components/ui/button';

/**
 * The teacher's entry point into the Google Classroom flow.
 *
 * A plain <form>, not react-router's <Form>, and that is deliberate: the action
 * answers with a redirect to classroom.google.com. A client-side submission
 * would try to resolve that redirect itself and be stopped at the cross-origin
 * boundary. A native form POST lets the browser follow the 302 the way it
 * follows any other, which is the only thing that gets the teacher to Google.
 *
 * It opens in a new tab so the teacher keeps the assignment page they were on;
 * Classroom's own "shared" confirmation is the end of the flow over there.
 */

export const SHARE_TO_CLASSROOM_ACTION = '/api/classroom/share';

export function ShareToGoogleClassroomButton({
  classAssignmentId,
  className,
}: {
  classAssignmentId: string;
  className?: string;
}) {
  return (
    <form
      method="post"
      action={SHARE_TO_CLASSROOM_ACTION}
      target="_blank"
      className={className}
    >
      <input type="hidden" name="classAssignmentId" value={classAssignmentId} />
      <Button type="submit" variant="outline" size="sm">
        <GoogleClassroomIcon className="mr-2 h-4 w-4" aria-hidden="true" />
        Share to Google Classroom
      </Button>
    </form>
  );
}

/**
 * Google Classroom's mark, drawn rather than hotlinked so the button does not
 * depend on a Google asset host at render time.
 */
function GoogleClassroomIcon({
  className,
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm9 5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM7.5 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM12 13.5c-2.2 0-4 1.1-4 2.4V17h8v-1.1c0-1.3-1.8-2.4-4-2.4Zm-4.5.6c-1.6 0-3 .8-3 1.8V17h2.2v-1.1c0-.6.3-1.2.8-1.8Zm9 0c.5.6.8 1.2.8 1.8V17h2.2v-1.1c0-1-1.4-1.8-3-1.8Z" />
    </svg>
  );
}
