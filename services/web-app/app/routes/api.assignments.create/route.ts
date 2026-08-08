import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import {
  buildAssignmentCreateInputFromApHistoryEntry,
  getApHistoryLibraryEntryForSnapshot,
} from '~/domain/ap-history/library.server';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  parseGradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';
import { isAssignmentTypeAvailableForEveryScope } from '~/utils/assignment-type-access.server';
import { createAssignmentDeployedToClasses } from '~/utils/assignment-deployment.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { parseAssignmentGradingIntent } from '~/utils/assignment-grading-intent.server';
import { parseAssignmentTutorEnabled } from '~/utils/assignment-tutor-enabled.server';

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== "TEACHER") {
    return dataResponse(
      { success: false, message: 'Only teachers can create assignments.' },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const intent = formData.get('intent')?.toString();
  if (intent !== 'create-assignment') {
    return dataResponse(
      { success: false, message: 'Unsupported action.' },
      { status: 400 }
    );
  }

  const assignmentTypeId = formData.get('assignmentTypeId')?.toString();
  const classIds = formData
    .getAll('classIds')
    .map((value) => value.toString())
    .filter(Boolean);
  const titleRaw = formData.get('title')?.toString() ?? '';
  const promptRaw = formData.get('prompt')?.toString() ?? '';
  const apHistoryLibraryEntryIdRaw =
    formData.get('apHistoryLibraryEntryId')?.toString() ?? '';
  const strictnessRaw = formData.get('gradingAssistantStrictnessLevel');

  const title = titleRaw.trim() || null;
  const prompt = promptRaw.trim();
  const apHistoryLibraryEntryId = apHistoryLibraryEntryIdRaw.trim();
  const gradingAssistantStrictnessLevel = strictnessRaw
    ? parseGradingAssistantStrictnessLevel(strictnessRaw)
    : DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL;

  if (!assignmentTypeId) {
    return dataResponse(
      { success: false, message: 'Assignment type is required.' },
      { status: 400 }
    );
  }
  if (classIds.length === 0) {
    return dataResponse(
      { success: false, message: 'At least one class is required.' },
      { status: 400 }
    );
  }
  if (!gradingAssistantStrictnessLevel) {
    return dataResponse(
      {
        success: false,
        message: 'Grading assistant strictness level is invalid.',
      },
      { status: 400 }
    );
  }

  const tutorEnabledResult = parseAssignmentTutorEnabled(formData);
  if (!tutorEnabledResult.success) {
    return dataResponse(
      { success: false, message: tutorEnabledResult.message },
      { status: 400 }
    );
  }
  const tutorEnabled = tutorEnabledResult.value;

  const classes = await prisma.class.findMany({
    where: {
      id: { in: classIds },
      teachers: { some: { id: profile.id } },
      isArchived: false,
    },
    select: {
      id: true,
      school: { select: { id: true, organizationId: true } },
    },
  });

  if (classes.length !== new Set(classIds).size) {
    return dataResponse(
      { success: false, message: 'One or more classes are unavailable.' },
      { status: 404 }
    );
  }

  const gradingIntent = parseAssignmentGradingIntent(formData);
  if (gradingIntent && !gradingIntent.success) {
    return dataResponse(
      { success: false, message: gradingIntent.message },
      { status: 400 }
    );
  }

  const assignmentTypeAvailable = await isAssignmentTypeAvailableForEveryScope({
    assignmentTypeId,
    scopes: classes.map((klass) => ({
      organizationId: klass.school.organizationId,
      schoolId: klass.school.id,
      teacherProfileId: profile.id,
    })),
  });

  const assignmentType = await prisma.assignmentType.findFirst({
    where: {
      id: assignmentTypeId,
      archivedAt: null,
    },
    select: { id: true, systemKey: true },
  });

  if (!assignmentTypeAvailable || !assignmentType) {
    return dataResponse(
      {
        success: false,
        message: 'Selected assignment type is not available.',
      },
      { status: 400 }
    );
  }

  const deployClassIds = classes.map((klass) => klass.id);

  if (assignmentType.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY) {
    if (!apHistoryLibraryEntryId) {
      return dataResponse(
        { success: false, message: 'AP History library entry is required.' },
        { status: 400 }
      );
    }

    const entry = await getApHistoryLibraryEntryForSnapshot({
      assignmentTypeId: assignmentType.id,
      externalKey: apHistoryLibraryEntryId,
    });
    if (!entry) {
      return dataResponse(
        { success: false, message: 'AP History library entry is unavailable.' },
        { status: 400 }
      );
    }

    await createAssignmentDeployedToClasses({
      data: {
        ...buildAssignmentCreateInputFromApHistoryEntry({
          assignmentTypeId: assignmentType.id,
          title,
          entry,
          gradingAssistantStrictnessLevel,
        }),
        tutorEnabled,
      },
      classIds: deployClassIds,
    });

    return dataResponse({
      success: true,
      message: 'Assignment created and applied to classes.',
    });
  }

  if (!prompt) {
    return dataResponse(
      { success: false, message: 'Prompt is required.' },
      { status: 400 }
    );
  }

  await createAssignmentDeployedToClasses({
    data: {
      assignmentTypeId: assignmentType.id,
      title,
      prompt,
      gradingAssistantStrictnessLevel,
      tutorEnabled,
      ...(gradingIntent?.success
        ? {
            submitForGrade: gradingIntent.data.submitForGrade,
            pointValue: gradingIntent.data.pointValue,
          }
        : {}),
    },
    classIds: deployClassIds,
  });

  return dataResponse({
    success: true,
    message: 'Assignment created and applied to classes.',
  });
}
