// Saves a generated thesis prompt to the teacher's "My prompts" collection.
//
// Called by the prompt generator two ways: explicitly from "Save prompt", and
// implicitly from "Use this prompt" so anything a teacher actually assigns is
// kept. Both go through the same idempotent upsert, so the two never duplicate.

import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import {
  saveThesisPrompt,
  SavedPromptError,
} from '~/domain/thesis-prompts/saved-prompts.server';
import {
  isAssignmentTypeAvailableForAnyScope,
  type AssignmentTypeAccessScope,
} from '~/utils/assignment-type-access.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const GENERIC_ERROR = "That prompt couldn't be saved. Please try again.";

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'TEACHER') {
    return dataResponse(
      { success: false, message: 'Only teachers can save prompts.' },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const assignmentTypeId = String(
    formData.get('assignmentTypeId') ?? ''
  ).trim();
  const prompt = String(formData.get('prompt') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();

  if (!assignmentTypeId || !prompt) {
    return dataResponse(
      { success: false, message: 'A prompt is required.' },
      { status: 400 }
    );
  }

  const teacherClasses = await prisma.class.findMany({
    where: { teachers: { some: { id: profile.id } }, isArchived: false },
    select: { id: true, school: { select: { id: true, organizationId: true } } },
  });
  const scopes: AssignmentTypeAccessScope[] =
    teacherClasses.length === 0
      ? [{ organizationId: profile.organization.id, teacherProfileId: profile.id }]
      : teacherClasses.map((klass) => ({
          organizationId: klass.school.organizationId,
          schoolId: klass.school.id,
          teacherProfileId: profile.id,
        }));

  const available = await isAssignmentTypeAvailableForAnyScope({
    assignmentTypeId,
    scopes,
  });
  if (!available) {
    return dataResponse(
      { success: false, message: 'Assignment type not found.' },
      { status: 404 }
    );
  }

  try {
    const saved = await saveThesisPrompt({
      membershipId: profile.id,
      assignmentTypeId,
      title,
      prompt,
    });
    return dataResponse({ success: true, saved });
  } catch (error) {
    if (error instanceof SavedPromptError) {
      return dataResponse(
        { success: false, message: error.message },
        { status: 400 }
      );
    }
    return dataResponse(
      { success: false, message: GENERIC_ERROR },
      { status: 500 }
    );
  }
}
