import { data as dataResponse, type LoaderFunctionArgs } from 'react-router';
import { readInsightRubric } from '~/domain/assignment-insights/insight-rubric.server';
import { loadClassModelInputs } from '~/domain/assignment-insights/class-model-inputs.server';
import {
  selectClassModels,
  type ClassModelsSummary,
} from '~/domain/assignment-insights/select-class-models';
import { isAssignmentSummaryModelsEnabled } from '~/domain/feature-flags/feature-flags.server';
import { prisma } from '~/utils/db.server';
import { canManageGrades, getGradingActor } from '~/utils/grading-auth.server';

type ModelsData = { models: ClassModelsSummary | null; message?: string };

function fail(status: number, message: string) {
  return dataResponse<ModelsData>({ models: null, message }, { status });
}

/**
 * Student work a teacher could put in front of the whole class on purpose: a
 * strong model and an instructive example for the class's weakest rubric
 * categories, from the latest graded submission per student. Computed on
 * request and never stored, so it always reflects the current grades and
 * leaves nothing behind when the flag is turned off.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return fail(403, 'Only teachers can view class insights.');
  }

  if (!(await isAssignmentSummaryModelsEnabled(actor.organizationId))) {
    return fail(404, 'Not found.');
  }

  const classAssignmentId = new URL(request.url).searchParams.get(
    'classAssignmentId'
  );
  if (typeof classAssignmentId !== 'string' || !classAssignmentId.trim()) {
    return fail(400, 'A class assignment is required.');
  }

  // Authorization mirrors the summary and examples routes: every actor stays
  // inside their organization; admins bypass only the teacher-ownership check.
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
    return fail(404, 'Assignment not found.');
  }
  if (!classAssignment.class.school.organization.classInsightsEnabled) {
    return fail(404, 'Class insights are not enabled.');
  }

  const rubric = await readInsightRubric({
    classAssignmentId: classAssignment.id,
  });

  const inputs = await loadClassModelInputs(classAssignment.id);

  return dataResponse<ModelsData>({
    models: selectClassModels(inputs, rubric),
  });
}
