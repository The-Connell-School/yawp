// Saves a generated Daily Pages prompt to the teacher's "My prompts" collection.
//
// Called by the prompt generator two ways: explicitly from "Save prompt", and
// implicitly from "Use this prompt" so anything a teacher actually assigns is
// kept. Both go through the same idempotent upsert, so the two never duplicate.

import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import {
  saveDailyPagesPrompt,
  SavedPromptError,
} from '~/domain/daily-pages-prompts/saved-prompts.server';
import type { SavedPromptFacets } from '../app.assignment-types.$id/prompts-library/data';
import {
  isAssignmentTypeAvailableForAnyScope,
  type AssignmentTypeAccessScope,
} from '~/utils/assignment-type-access.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const GENERIC_ERROR = "That prompt couldn't be saved. Please try again.";

/**
 * The generator sends the draft's tags along as JSON. They're a nicety, not the
 * point of the save — anything unparseable is simply dropped, and the server
 * validates whatever does parse against the library vocabulary.
 */
function parseFacets(raw: FormDataEntryValue | null): SavedPromptFacets {
  if (typeof raw !== 'string' || raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as SavedPromptFacets)
      : {};
  } catch {
    return {};
  }
}

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
  const assignmentTypeId = String(formData.get('assignmentTypeId') ?? '').trim();
  const prompt = String(formData.get('prompt') ?? '').trim();
  const facets = parseFacets(formData.get('facets'));

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
      ? [
          {
            organizationId: profile.organization.id,
            teacherProfileId: profile.id,
          },
        ]
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
    const saved = await saveDailyPagesPrompt({
      membershipId: profile.id,
      assignmentTypeId,
      prompt,
      facets,
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
