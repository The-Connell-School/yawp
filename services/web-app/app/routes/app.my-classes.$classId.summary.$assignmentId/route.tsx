import { type LoaderFunctionArgs, Link, redirect, useParams, useSearchParams, useRouteLoaderData } from 'react-router';
import { Button } from '~/components/ui/button';
import { CaretLeftIcon } from '~/components/icons';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { ClassInsightsPanel } from '../app.my-classes.$classId_.assignments.$assignmentId/class-insights-panel';
import { buildGradedCountByAssignmentId } from '../app.my-classes.$classId/graded-count';
import type { loader as classDetailLoader } from '../app.my-classes.$classId/route';

/**
 * Auth-only loader — assignment and insight data come from the parent class
 * detail route's loader (`routes/app.my-classes.$classId`) via
 * useRouteLoaderData, mirroring the assignment-detail route
 * (`app.my-classes.$classId.assignment.$assignmentId`) so both nested pages
 * share one source of truth instead of re-querying it. This loader exists
 * only so a teacher who deep-links straight into this URL still gets the
 * same auth gate as every other teacher route.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') {
    return redirect('/app');
  }
  return null;
}

export default function ClassSummaryRoute() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const classId = params.classId!;
  const assignmentId = params.assignmentId!;

  const parentData = useRouteLoaderData<typeof classDetailLoader>(
    'routes/app.my-classes.$classId'
  );

  const backSearch = searchParams.toString();
  const backHref = backSearch
    ? `/app/my-classes/${classId}?${backSearch}`
    : `/app/my-classes/${classId}?tab=documents`;

  const gradedCountByAssignmentId = buildGradedCountByAssignmentId(
    parentData?.submissions ?? []
  );

  const classAssignment = parentData?.assignments.find(
    (assignment) => assignment.id === assignmentId
  );

  if (!parentData || !classAssignment) {
    return (
      <div className="text-foreground" data-testid="class-summary-page">
        <div className="mb-4">
          <Button asChild variant="outline" size="sm">
            <Link to={backHref}>
              <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to documents
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">Assignment not found.</p>
      </div>
    );
  }

  const title = classAssignment.title ?? 'Assignment';

  return (
    <div className="text-foreground" data-testid="class-summary-page">
      <div className="mb-4">
        <Button asChild variant="outline" size="sm">
          <Link to={backHref}>
            <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to documents
          </Link>
        </Button>
      </div>

      <h2 className="mb-4 text-lg font-semibold" data-testid="class-summary-page-title">
        {title}
      </h2>

      {parentData.classInsightsEnabled === true ? (
        <ClassInsightsPanel
          classAssignmentId={classAssignment.classAssignmentId}
          initialInsight={classAssignment.insight}
          gradedCount={gradedCountByAssignmentId.get(classAssignment.id) ?? 0}
        />
      ) : (
        /*
         * ClassInsightsPanel is this page's only body content, so with the
         * organization's classInsightsEnabled flag off the page would
         * otherwise be a bare heading. The in-app entry point on the
         * Documents tab is gated on the same flag, but the URL is
         * deep-linkable — a bookmark, a shared link, or an org whose flag
         * was turned back off all land here.
         */
        <div
          className="rounded-lg border bg-muted/30 p-4"
          data-testid="class-summary-insights-disabled"
        >
          <p className="text-sm text-muted-foreground">
            Class performance summaries are not turned on for your
            organization. Ask your administrator to enable them, then come
            back to see how the class did on this assignment.
          </p>
        </div>
      )}
    </div>
  );
}
