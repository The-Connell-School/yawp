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
import {
  AssignmentPromptAttachmentError,
  assignmentPromptAttachmentRequestTooLarge,
  deleteAssignmentPromptAttachment,
  uploadAssignmentPromptAttachment,
} from '~/domain/assignments/assignment-prompt-attachment.server';
import {
  SAVED_ASSIGNMENTS_ENABLED,
  saveAssignmentForReuse,
} from '~/domain/assignments/saved-assignments.server';
import { isAssignmentTypeAvailableForEveryScope } from '~/utils/assignment-type-access.server';
import { autoArrangeNewAssignment } from '~/domain/collaboration/auto-arrange.server';
import { groupSetupNextStep } from '~/domain/collaboration/next-step';
import { createAssignmentDeployedToClasses } from '~/utils/assignment-deployment.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  DEFAULT_ASSIGNMENT_POINT_VALUE,
  parseAssignmentGradingIntent,
} from '~/utils/assignment-grading-intent.server';
import { parseAssignmentCollaboration } from '~/utils/assignment-collaboration.server';
import { parseAssignmentTutorEnabled } from '~/utils/assignment-tutor-enabled.server';
import { parseAssignmentGrammarGrading } from '~/utils/assignment-grammar-grading.server';

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'TEACHER') {
    return dataResponse(
      { success: false, message: 'Only teachers can create assignments.' },
      { status: 403 }
    );
  }

  if (assignmentPromptAttachmentRequestTooLarge(request)) {
    return dataResponse(
      { success: false, message: 'PDF is too large. Maximum size is 10 MB.' },
      { status: 413 }
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

  const grammarGradingResult = parseAssignmentGrammarGrading(formData);
  if (!grammarGradingResult.success) {
    return dataResponse(
      { success: false, message: grammarGradingResult.message },
      { status: 400 }
    );
  }
  const grammarGradingEnabled = grammarGradingResult.value;

  const collaborationResult = parseAssignmentCollaboration(formData);
  if (!collaborationResult.success) {
    return dataResponse(
      { success: false, message: collaborationResult.message },
      { status: 400 }
    );
  }

  // Optional deployment dates (applied to each selected class)
  let postAt: Date | null = null;
  let dueAt: Date | null = null;
  const postAtRaw = formData.get('postAt')?.toString()?.trim() ?? '';
  const dueAtRaw = formData.get('dueAt')?.toString()?.trim() ?? '';
  if (postAtRaw) {
    const parsed = new Date(postAtRaw);
    if (Number.isNaN(parsed.getTime())) {
      return dataResponse(
        { success: false, message: 'The post date is invalid.' },
        { status: 400 }
      );
    }
    postAt = parsed;
  }
  if (dueAtRaw) {
    const parsed = new Date(dueAtRaw);
    if (Number.isNaN(parsed.getTime())) {
      return dataResponse(
        { success: false, message: 'The due date is invalid.' },
        { status: 400 }
      );
    }
    dueAt = parsed;
  }

  const classes = await prisma.class.findMany({
    where: {
      id: { in: classIds },
      teachers: { some: { id: profile.id } },
      isArchived: false,
    },
    select: {
      id: true,
      school: {
        select: {
          id: true,
          organizationId: true,
        },
      },
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

  const collaboration = collaborationResult.value;

  if (collaboration.collaborationEnabled) {
    const emptyClass = await prisma.class.findFirst({
      where: { id: { in: classIds }, students: { none: {} } },
      select: { id: true },
    });
    if (emptyClass) {
      return dataResponse(
        {
          success: false,
          message:
            'Add students to every selected class before creating a collaborative assignment.',
        },
        { status: 400 }
      );
    }
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

    const createdApAssignment = await createAssignmentDeployedToClasses({
      data: {
        ...buildAssignmentCreateInputFromApHistoryEntry({
          assignmentTypeId: assignmentType.id,
          title,
          entry,
          gradingAssistantStrictnessLevel,
        }),
        tutorEnabled,
        grammarGradingEnabled,
        ...collaboration,
      },
      classIds: deployClassIds,
      deployment: { postAt, dueAt },
    });

    let nextStep: ReturnType<typeof groupSetupNextStep> = null;
    if (collaboration.collaborationEnabled) {
      await autoArrangeNewAssignment({
        assignmentId: createdApAssignment.id,
        mode: collaboration.collaborationGroupMode,
        groupSize: collaboration.collaborationGroupSize,
      });

      const deployments = await prisma.classAssignment.findMany({
        where: { assignmentId: createdApAssignment.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, classId: true },
      });
      nextStep = groupSetupNextStep({
        assignmentId: createdApAssignment.id,
        collaborationEnabled: true,
        deployments: deployments.map((deployment) => ({
          classAssignmentId: deployment.id,
          classId: deployment.classId,
        })),
      });
    }

    return dataResponse({
      success: true,
      message: 'Assignment created and applied to classes.',
      nextStep,
    });
  }

  if (!prompt) {
    return dataResponse(
      { success: false, message: 'Prompt is required.' },
      { status: 400 }
    );
  }

  const promptAttachment = formData.get('promptAttachment');
  let promptAttachmentData:
    Awaited<ReturnType<typeof uploadAssignmentPromptAttachment>> | undefined;
  if (promptAttachment instanceof File && promptAttachment.size > 0) {
    try {
      promptAttachmentData =
        await uploadAssignmentPromptAttachment(promptAttachment);
    } catch (error) {
      if (error instanceof AssignmentPromptAttachmentError) {
        return dataResponse(
          { success: false, message: error.message },
          { status: 400 }
        );
      }
      throw error;
    }
  }

  let nextStep: ReturnType<typeof groupSetupNextStep> = null;

  try {
    const createdAssignment = await createAssignmentDeployedToClasses({
      data: {
        assignmentTypeId: assignmentType.id,
        title,
        prompt,
        gradingAssistantStrictnessLevel,
        tutorEnabled,
        grammarGradingEnabled,
        ...collaboration,
        ...promptAttachmentData,
        ...(gradingIntent?.success
          ? {
              submitForGrade: gradingIntent.data.submitForGrade,
              pointValue: gradingIntent.data.pointValue,
            }
          : {}),
      },
      classIds: deployClassIds,
      deployment: { postAt, dueAt },
    });

    // "Group them for me" and "one doc for the whole class" describe an
    // arrangement completely, so it is formed now rather than making the
    // teacher press Shuffle to reach the answer they already chose. Nothing is
    // opened, so it stays editable.
    if (collaboration.collaborationEnabled) {
      await autoArrangeNewAssignment({
        assignmentId: createdAssignment.id,
        mode: collaboration.collaborationGroupMode,
        groupSize: collaboration.collaborationGroupSize,
      });

      // Creating is not the end of the job: students see nothing until groups
      // are opened, so the teacher is sent to finish it rather than left on
      // whatever page they started from with no sign anything is outstanding.
      const deployments = await prisma.classAssignment.findMany({
        where: { assignmentId: createdAssignment.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, classId: true },
      });
      nextStep = groupSetupNextStep({
        assignmentId: createdAssignment.id,
        collaborationEnabled: true,
        deployments: deployments.map((deployment) => ({
          classAssignmentId: deployment.id,
          classId: deployment.classId,
        })),
      });
    }
  } catch (error) {
    if (promptAttachmentData?.promptAttachmentKey) {
      await deleteAssignmentPromptAttachment(
        promptAttachmentData.promptAttachmentKey
      ).catch(() => {});
    }
    throw error;
  }

  // "My Saved Assignments": keep the configuration so the teacher can push the
  // same assignment again later. The classes already have the assignment by
  // this point, so a failed save is reported alongside the success rather than
  // rolling the creation back.
  const saveForReuse =
    SAVED_ASSIGNMENTS_ENABLED &&
    formData.get('saveForReuse')?.toString() === 'true';
  if (saveForReuse) {
    try {
      await saveAssignmentForReuse({
        membershipId: profile.id,
        assignmentTypeId: assignmentType.id,
        title: title ?? '',
        prompt,
        submitForGrade: gradingIntent?.success
          ? gradingIntent.data.submitForGrade
          : true,
        // Mirrors the assignment that was just created: no grading fields on
        // the form means submitted for a grade at the default point value.
        pointValue: gradingIntent?.success
          ? gradingIntent.data.pointValue
          : DEFAULT_ASSIGNMENT_POINT_VALUE,
        gradingAssistantStrictnessLevel,
        tutorEnabled,
        ...collaboration,
      });
    } catch {
      return dataResponse({
        success: true,
        message:
          'Assignment created and applied to classes, but it could not be saved for reuse.',
        nextStep,
      });
    }
  }

  return dataResponse({
    success: true,
    message: nextStep
      ? 'Assignment created. Students cannot see it until you finalize groups.'
      : 'Assignment created and applied to classes.',
    nextStep,
  });
}
