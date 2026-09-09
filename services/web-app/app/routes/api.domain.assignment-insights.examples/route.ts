import { data as dataResponse, type LoaderFunctionArgs } from 'react-router';
import {
  readRubricEntryScore,
  type SubmissionRubricEntry,
} from '~/domain/assignment-insights/aggregate-rubric-performance';
import { readInsightRubric } from '~/domain/assignment-insights/insight-rubric.server';
import { midpointScore } from '~/domain/assignment-insights/insight-rubric';
import { prisma } from '~/utils/db.server';
import { canManageGrades, getGradingActor } from '~/utils/grading-auth.server';

/** How many example snippets to surface per category. */
const MAX_EXAMPLES = 3;
/** Trim snippets so the panel stays scannable. */
const SNIPPET_MAX_CHARS = 240;

type CategoryStatus = 'strength' | 'mixed' | 'gap';

const STATUS_VALUES: CategoryStatus[] = ['strength', 'mixed', 'gap'];

export type ClassInsightExample = {
  snippet: string;
  score: number;
  studentName: string;
  href: string;
};

function toSnippet(raw: string): string {
  const text = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= SNIPPET_MAX_CHARS) return text;
  const truncated = text.slice(0, SNIPPET_MAX_CHARS);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${truncated.slice(0, lastSpace > 60 ? lastSpace : SNIPPET_MAX_CHARS).trim()}…`;
}

/**
 * Rank submissions by how well they exemplify a category's status: strongest
 * scores first for a strength, weakest first for a gap, closest-to-middle for
 * a mixed category.
 *
 * "Middle" is the middle of the category's own range — a 3 on the default
 * five-point rubric, a 50 on a hundred-point one.
 */
function exemplarComparator(status: CategoryStatus, middle: number) {
  return (a: { score: number }, b: { score: number }) => {
    if (status === 'gap') return a.score - b.score;
    if (status === 'strength') return b.score - a.score;
    return Math.abs(a.score - middle) - Math.abs(b.score - middle);
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return dataResponse(
      { examples: [], message: 'Only teachers can view class insights.' },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const classAssignmentId = url.searchParams.get('classAssignmentId');
  const category = url.searchParams.get('category');
  const rawStatus = url.searchParams.get('status');
  const status: CategoryStatus = STATUS_VALUES.includes(
    rawStatus as CategoryStatus
  )
    ? (rawStatus as CategoryStatus)
    : 'mixed';

  if (
    typeof classAssignmentId !== 'string' ||
    !classAssignmentId.trim() ||
    typeof category !== 'string' ||
    !category.trim()
  ) {
    return dataResponse(
      {
        examples: [],
        message: 'A class assignment and rubric category are required.',
      },
      { status: 400 }
    );
  }

  // Authorization mirrors the summary route: every actor stays inside their
  // organization, while admins bypass only the teacher-ownership predicate.
  const classAssignment = await prisma.classAssignment.findFirst({
    where: {
      id: classAssignmentId,
      class: {
        school: { organizationId: actor.organizationId },
        ...(actor.isAdmin
          ? {}
          : { teachers: { some: { id: actor.membershipId } } }),
      },
    },
    select: {
      id: true,
      class: {
        select: {
          school: {
            select: {
              organization: { select: { classInsightsEnabled: true } },
            },
          },
        },
      },
    },
  });
  if (!classAssignment) {
    return dataResponse(
      { examples: [], message: 'Assignment not found.' },
      { status: 404 }
    );
  }
  if (!classAssignment.class.school.organization.classInsightsEnabled) {
    return dataResponse(
      { examples: [], message: 'Class insights are not enabled.' },
      { status: 404 }
    );
  }

  // The category has to be one this assignment is actually graded on, and that
  // is only knowable once the class assignment is loaded — an assignment type
  // carries its own rubric, so there is no fixed list to check against.
  const rubric = await readInsightRubric({
    classAssignmentId: classAssignment.id,
  });
  const rubricCategory = rubric.categories.find(
    (entry) => entry.key === category
  );
  if (!rubricCategory) {
    return dataResponse(
      {
        examples: [],
        message: 'That category is not on this assignment’s rubric.',
      },
      { status: 400 }
    );
  }

  // Latest graded submission per student document, with the graded text and
  // the student's identity — the teacher owns this data and wants to know who
  // the exemplars are and open their full paper.
  const documents = await prisma.document.findMany({
    where: { classAssignmentId: classAssignment.id, deletedAt: null },
    select: {
      id: true,
      membership: {
        select: { user: { select: { name: true, email: true } } },
      },
      group: { select: { label: true } },
      submissions: {
        where: { gradedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: { id: true, text: true, html: true, rubricScores: true },
      },
    },
  });

  const scored: Array<ClassInsightExample> = [];
  for (const doc of documents) {
    const submission = doc.submissions[0];
    if (!submission) continue;
    const rubricScores = submission.rubricScores as Record<
      string,
      SubmissionRubricEntry
    > | null;
    const score = readRubricEntryScore(rubricScores?.[category]);
    if (score === null) continue;
    const raw =
      (typeof submission.text === 'string' && submission.text.trim()) ||
      (typeof submission.html === 'string' && submission.html) ||
      '';
    const snippet = toSnippet(raw);
    if (!snippet) continue;
    const studentName =
      doc.group?.label?.trim() ||
      doc.membership?.user?.name?.trim() ||
      doc.membership?.user?.email?.trim() ||
      'Unknown student';
    scored.push({
      snippet,
      score,
      studentName,
      href: `/app/submissions/${submission.id}`,
    });
  }

  scored.sort(exemplarComparator(status, midpointScore(rubricCategory)));

  const examples: ClassInsightExample[] = scored.slice(0, MAX_EXAMPLES);

  return dataResponse({ examples });
}
