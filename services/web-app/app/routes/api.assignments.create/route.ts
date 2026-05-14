import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { isAssignmentsEnabledForOrganization } from '~/utils/feature-flags.server';

function parseDateOnlyToUtc(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.teacherProfile) {
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
  const tutorContextRaw = formData.get('tutorContext')?.toString() ?? '';
  const dueDateRaw = formData.get('dueDate')?.toString() ?? '';

  const title = titleRaw.trim() || null;
  const prompt = promptRaw.trim();
  const tutorContext = tutorContextRaw.trim() || null;
  const dueDateInput = dueDateRaw.trim();
  const dueDate = dueDateInput ? parseDateOnlyToUtc(dueDateInput) : null;

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
  if (!prompt) {
    return dataResponse(
      { success: false, message: 'Prompt is required.' },
      { status: 400 }
    );
  }
  if (dueDateInput && !dueDate) {
    return dataResponse(
      { success: false, message: 'Due date is invalid.' },
      { status: 400 }
    );
  }

  const classes = await prisma.class.findMany({
    where: {
      id: { in: classIds },
      teachers: { some: { id: profile.teacherProfile.id } },
      isArchived: false,
    },
    select: {
      id: true,
      school: { select: { organizationId: true } },
    },
  });

  if (classes.length !== new Set(classIds).size) {
    return dataResponse(
      { success: false, message: 'One or more classes are unavailable.' },
      { status: 404 }
    );
  }

  const organizationIds = Array.from(
    new Set(classes.map((klass) => klass.school.organizationId))
  );
  const assignmentFlags = await Promise.all(
    organizationIds.map((organizationId) =>
      isAssignmentsEnabledForOrganization(organizationId)
    )
  );
  if (assignmentFlags.some((enabled) => !enabled)) {
    return dataResponse(
      {
        success: false,
        message: 'Assignments are not enabled for one or more classes.',
      },
      { status: 403 }
    );
  }

  const assignmentType = await prisma.assignmentType.findFirst({
    where: {
      id: assignmentTypeId,
      ownerOrgId: { in: organizationIds },
    },
    select: { id: true },
  });

  if (!assignmentType) {
    return dataResponse(
      {
        success: false,
        message: 'Selected assignment type is not available.',
      },
      { status: 400 }
    );
  }

  await prisma.assignment.createMany({
    data: classes.map((klass) => ({
      classId: klass.id,
      assignmentTypeId: assignmentType.id,
      title,
      prompt,
      tutorContext,
      dueDate,
    })),
  });

  return dataResponse({
    success: true,
    message: 'Assignments created successfully.',
  });
}
