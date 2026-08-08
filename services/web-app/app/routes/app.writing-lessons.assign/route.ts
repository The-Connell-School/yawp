import { data as dataResponse, type ActionFunctionArgs } from 'react-router';

import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { createWritingPracticeAssignmentForClasses } from '~/utils/writing-lessons/practice-assignments.server';
import { getQuickWritingLessonBySlug } from '~/utils/writing-lessons/static-lessons.server';

const MIN_PROBLEM_COUNT = 1;
const MAX_PROBLEM_COUNT = 20;

type AssignResult = { success: boolean; message: string; classCount?: number };

function fail(message: string, status = 400) {
  return dataResponse<AssignResult>({ success: false, message }, { status });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);

  if (!membership.organization.writingPracticeEnabled) {
    return fail('Writing practice is not enabled for your organization.', 404);
  }

  if (membership.role !== 'TEACHER') {
    return fail('Only teachers can assign writing practice.', 403);
  }

  const formData = await request.formData();
  const lessonSlugs = formData
    .getAll('lessonSlugs')
    .map(String)
    .filter(Boolean);
  const classIds = formData.getAll('classIds').map(String).filter(Boolean);
  const title = String(formData.get('title') ?? '').trim();
  const dueAtRaw = String(formData.get('dueAt') ?? '').trim();
  const instructions = String(formData.get('instructions') ?? '').trim();
  const problemCount = Number(formData.get('problemCount'));

  if (!title) return fail('Assignment title is required.');
  if (lessonSlugs.length === 0) return fail('Pick a lesson to assign.');

  const invalidSlug = lessonSlugs.find(
    (slug) => !getQuickWritingLessonBySlug(slug)
  );
  if (invalidSlug) return fail(`Unknown lesson: ${invalidSlug}.`);
  if (classIds.length === 0) return fail('Pick at least one class.');

  if (
    !Number.isInteger(problemCount) ||
    problemCount < MIN_PROBLEM_COUNT ||
    problemCount > MAX_PROBLEM_COUNT
  ) {
    return fail(
      `Number of problems must be between ${MIN_PROBLEM_COUNT} and ${MAX_PROBLEM_COUNT}.`
    );
  }

  if (!dueAtRaw) return fail('Due date is required.');
  const dueAt = new Date(dueAtRaw);
  if (Number.isNaN(dueAt.getTime())) return fail('The due date is invalid.');

  const ownedClasses = await prisma.class.findMany({
    where: {
      id: { in: classIds },
      teachers: { some: { id: membership.id } },
      isArchived: false,
    },
    select: { id: true },
  });
  if (ownedClasses.length !== new Set(classIds).size) {
    return fail('You can only assign to your own classes.', 403);
  }

  await createWritingPracticeAssignmentForClasses(
    {
      createdByMembershipId: membership.id,
      title,
      lessonSlugs,
      problemCount,
      dueAt,
      instructions: instructions || null,
    },
    classIds
  );

  return dataResponse<AssignResult>({
    success: true,
    message:
      classIds.length === 1
        ? 'Practice assigned to 1 class.'
        : `Practice assigned to ${classIds.length} classes.`,
    classCount: classIds.length,
  });
}
