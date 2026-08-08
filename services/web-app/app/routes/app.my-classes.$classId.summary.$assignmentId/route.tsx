import {
  type LoaderFunctionArgs,
  Link,
  redirect,
  useLoaderData,
  useParams,
  useSearchParams,
  useRouteLoaderData,
} from 'react-router';
import { Button } from '~/components/ui/button';
import { CaretLeftIcon } from '~/components/icons';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import type {
  SectionInsightInput,
  SectionSummary,
} from '~/domain/assignment-insights/combine-section-insights';
import { ClassInsightsPanel } from '../app.my-classes.$classId_.assignments.$assignmentId/class-insights-panel';
import { buildGradedCountByAssignmentId } from '../app.my-classes.$classId/graded-count';
import type { loader as classDetailLoader } from '../app.my-classes.$classId/route';
import { AcrossSectionsPanel } from './across-sections-panel';

/** Search param that opts the page into the across-sections view. */
export const ACROSS_SECTIONS_PARAM = 'sections';
export const ACROSS_SECTIONS_VALUE = 'all';

function sectionLabel(klass: {
  grade: string | null;
  period: string | null;
  title: string | null;
}): string {
  const parts = [
    klass.grade ? `Grade ${klass.grade}` : null,
    klass.period ? `Period ${klass.period}` : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return klass.title?.trim() || 'Untitled class';
}

/**
 * Auth, plus the sections this assignment runs in.
 *
 * Assignment and single-class insight data still come from the parent class
 * detail route's loader (`routes/app.my-classes.$classId`) via
 * useRouteLoaderData, so the default single-class view stays one source of
 * truth with the rest of the class page. What the parent cannot know is the
 * *other* classes the same assignment was deployed to: an Assignment is one
 * row joined to each class through ClassAssignment, and each ClassAssignment
 * gets its own summary. This loader gathers those siblings — keyed by the
 * assignment ID in the URL — so a teacher running the same assignment in
 * three sections can read them together.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') {
    return redirect('/app');
  }

  if (!profile.organization.classInsightsEnabled) {
    return { sections: [] as SectionInsightInput[] };
  }

  const assignmentId = params.assignmentId!;

  const classAssignments = await prisma.classAssignment.findMany({
    where: {
      assignmentId,
      class: {
        isArchived: false,
        teachers: { some: { id: profile.id } },
      },
    },
    select: {
      id: true,
      classId: true,
      class: { select: { id: true, grade: true, period: true, title: true } },
      insight: {
        select: {
          status: true,
          submissionCount: true,
          generatedAt: true,
          summaryJson: true,
        },
      },
    },
    orderBy: [{ class: { grade: 'asc' } }, { class: { period: 'asc' } }],
  });

  // Graded work per section, counted the same way the summary generator
  // counts it (documents in the section with at least one graded submission).
  // A section with graded work but no summary is a prompt to go generate one,
  // not a mystery gap in the combined view.
  const gradedDocuments =
    classAssignments.length > 0
      ? await prisma.document.findMany({
          where: {
            classAssignmentId: { in: classAssignments.map((ca) => ca.id) },
            deletedAt: null,
            submissions: { some: { gradedAt: { not: null } } },
          },
          select: { classAssignmentId: true },
        })
      : [];

  const gradedCountByClassAssignmentId = new Map<string, number>();
  for (const document of gradedDocuments) {
    if (!document.classAssignmentId) continue;
    gradedCountByClassAssignmentId.set(
      document.classAssignmentId,
      (gradedCountByClassAssignmentId.get(document.classAssignmentId) ?? 0) + 1
    );
  }

  const sections: SectionInsightInput[] = classAssignments.map(
    (classAssignment) => {
      const insight = classAssignment.insight;
      const isReady =
        insight != null && insight.status === 'ready' && insight.summaryJson;
      return {
        classId: classAssignment.classId,
        classAssignmentId: classAssignment.id,
        label: sectionLabel(classAssignment.class),
        gradedCount:
          gradedCountByClassAssignmentId.get(classAssignment.id) ?? 0,
        insight: isReady
          ? {
              status: 'ready' as const,
              submissionCount: insight!.submissionCount,
              generatedAt: insight!.generatedAt
                ? insight!.generatedAt.toISOString()
                : null,
              summary: insight!.summaryJson as unknown as SectionSummary,
            }
          : null,
      };
    }
  );

  return { sections };
}

export default function ClassSummaryRoute() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const classId = params.classId!;
  const assignmentId = params.assignmentId!;

  const { sections } = useLoaderData<typeof loader>();

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

  // Single class is the view; reading across sections is opted into from
  // here, and only offered when the assignment actually runs elsewhere.
  const showingAllSections =
    searchParams.get(ACROSS_SECTIONS_PARAM) === ACROSS_SECTIONS_VALUE;
  const canReadAcrossSections = sections.length > 1;

  const buildToggleHref = (allSections: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (allSections) {
      next.set(ACROSS_SECTIONS_PARAM, ACROSS_SECTIONS_VALUE);
    } else {
      next.delete(ACROSS_SECTIONS_PARAM);
    }
    const search = next.toString();
    return `/app/my-classes/${classId}/summary/${assignmentId}${
      search ? `?${search}` : ''
    }`;
  };

  return (
    <div className="text-foreground" data-testid="class-summary-page">
      <div className="mb-4">
        <Button asChild variant="outline" size="sm">
          <Link to={backHref}>
            <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to documents
          </Link>
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold" data-testid="class-summary-page-title">
          {title}
        </h2>

        {parentData.classInsightsEnabled === true && canReadAcrossSections ? (
          <div
            className="inline-flex rounded-lg border bg-muted/40 p-0.5"
            role="group"
            aria-label="Sections included in this summary"
            data-testid="class-summary-scope-toggle"
          >
            <Link
              to={buildToggleHref(false)}
              replace
              aria-current={showingAllSections ? undefined : 'true'}
              data-testid="class-summary-scope-this-class"
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                showingAllSections
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'bg-background text-foreground shadow-sm'
              }`}
            >
              This class
            </Link>
            <Link
              to={buildToggleHref(true)}
              replace
              aria-current={showingAllSections ? 'true' : undefined}
              data-testid="class-summary-scope-all-sections"
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                showingAllSections
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All {sections.length} sections
            </Link>
          </div>
        ) : null}
      </div>

      {parentData.classInsightsEnabled === true ? (
        showingAllSections && canReadAcrossSections ? (
          <AcrossSectionsPanel
            sections={sections}
            currentClassId={classId}
          />
        ) : (
          <ClassInsightsPanel
            classAssignmentId={classAssignment.classAssignmentId}
            initialInsight={classAssignment.insight}
            gradedCount={gradedCountByAssignmentId.get(classAssignment.id) ?? 0}
          />
        )
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
