import { createModule, reorderModules } from '~/domain/assignment-types/assignment-type-module-writes.server';
import { readGradingInstructionsOverride } from '~/domain/assignment-types/assignment-type-admin-writes.shared';
import {
  listLiveRubricsForAdminPicker,
  resolveAdminRubricPickerSelection,
} from '~/domain/rubrics/admin-rubric-picker.server';
import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { data as dataResponse, redirect, useLoaderData } from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { AssignmentTypeEditorForm } from '~/components/admin/assignment-type-editor-form';
import { requireAdmin, requireUserId } from '~/utils/auth.server';
import {
  formatLastAdminEditLine,
  readLastAdminEdit,
} from '~/domain/assignment-types/assignment-type-admin-provenance.server';
import { resolvePlatformAdminActorEmail } from '~/utils/platform-admin-actor.server';
import { prisma } from '~/utils/db.server';
import { archiveAssignmentType, restoreAssignmentType, updateAssignmentType, replaceAssignmentTypeImage, removeAssignmentTypeImage, parseAdminUpdateGradingConfig, withGradingInstructionsOverride } from '~/domain/assignment-types/assignment-type-admin-writes.server';
import { resolveAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import { compileGradingAssistantInvocation } from '~/domain/grading/grading-assistant-invocation';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { computePromptVersionLabels } from '~/domain/ai-evaluation/assignment-type-evaluation.shared';
import { isPromptVersionControlEnabled } from '~/domain/ai-evaluation/prompt-version-control.server';
import {
  parseRubric,
  parseScoringScale,
} from '~/domain/assignment-types/assignment-type-rubric.shared';

const PROMPT_PREVIEW_INPUTS = {
  studentFirstName: 'Jordan',
  strictnessLevel: 'intermediate',
  documentText: '[CASE DOCUMENT CONTENT]',
} as const;

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const userId = await requireUserId(request);
  const superAdmin = await prisma.user.findFirst({
    where: { id: userId, isSuperAdmin: true },
    select: { id: true },
  });

  const assignmentTypeId = params.id;
  const course = await prisma.assignmentType.findUnique({
    where: { id: assignmentTypeId },
    include: {
      assignmentModules: {
        where: { deletedAt: null },
        include: {
          instructions: {
            orderBy: { position: 'asc' },
          },
        },
        orderBy: { position: 'asc' },
      },
      image: { select: { id: true } },
    },
  });

  if (!course) {
    throw new Response('Not Found', { status: 404 });
  }

  const rubrics = (await listLiveRubricsForAdminPicker()).map(
    ({ id, name, title, json }) => ({ id, name, title, json })
  );
  const currentPromptLabel = await resolveCurrentPromptLabel(course.id);
  if (course.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY) {
    const lastEditLine = formatLastAdminEditLine(
      course.updatedAt,
      readLastAdminEdit(course.gradingPromptConfigJson)
    );

    return dataResponse({
      course,
      rubrics,
      lastEditLine,
      scoringScale: parseScoringScale(course.scoringScaleJson),
      rubric: parseRubric(course.rubricJson),
      gradingAssistantPromptPreview: null,
      gradingAssistantPromptPreviewUnavailableReason:
        'The AP History prompt is built from the assignment snapshot. Open a graded submission to inspect the full prompt.',
      currentPromptLabel,
    });
  }

  const resolvedGradingConfig = await resolveAssignmentTypeGradingConfig({
    assignmentTypeId: course.id,
    assignmentTypeKind: course.kind,
    assignmentTypeTitle: course.title,
  });
  const compiledInvocation = compileGradingAssistantInvocation({
    gradingConfig: resolvedGradingConfig,
    ...PROMPT_PREVIEW_INPUTS,
  });

  const lastEditLine = formatLastAdminEditLine(
    course.updatedAt,
    readLastAdminEdit(course.gradingPromptConfigJson)
  );
  const scoringScale = parseScoringScale(course.scoringScaleJson);
  const rubric = parseRubric(
    resolvedGradingConfig.rubricSnapshot ?? course.rubricJson
  );

  return dataResponse({
    course,
    rubrics,
    lastEditLine,
    scoringScale,
    rubric,
    gradingAssistantPromptPreview: {
      ...compiledInvocation,
      version: resolvedGradingConfig.version,
      source: resolvedGradingConfig.source,
      previewInputs: PROMPT_PREVIEW_INPUTS,
    },
    gradingAssistantPromptPreviewUnavailableReason: null,
    currentPromptLabel,
  });
}

async function resolveCurrentPromptLabel(assignmentTypeId: string) {
  if (!isPromptVersionControlEnabled()) return null;

  const promptVersions = await prisma.assignmentTypePromptVersion.findMany({
    where: { assignmentTypeId },
    select: { id: true, createdAt: true, status: true },
  });
  const production = promptVersions.find(
    (promptVersion) => promptVersion.status === 'production'
  );
  if (!production) return null;

  const labels = computePromptVersionLabels(
    promptVersions.map((promptVersion) => ({
      id: promptVersion.id,
      createdAt: promptVersion.createdAt.toISOString(),
    }))
  );
  return labels.get(production.id) ?? null;
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireAdmin(request);
  const actorEmail = await resolvePlatformAdminActorEmail(request);
  const userId = await requireUserId(request);
  const superAdmin = await prisma.user.findFirst({
    where: { id: userId, isSuperAdmin: true },
    select: { id: true },
  });
  const formData = await request.formData();
  const intent = formData.get('intent');
  const assignmentTypeId = params.id;

  if (intent === 'deleteCourse') {
    await archiveAssignmentType(prisma, params.id!);

    return redirect('/app/admin/assignments');
  }

  if (intent === 'unarchiveCourse') {
    await restoreAssignmentType(prisma, params.id!);

    return dataResponse({ status: 'success' });
  }

  if (intent === 'updateCourse') {
    const title = formData.get('title')?.toString().trim();
    const description = formData.get('description')?.toString();
    // The assignment-level General Tutor Instructions -- the top of every
    // tutor prompt for this type. Only written when the form actually carried
    // the field, so a partial submission can never blank it out.
    const hasTutorInstructions = formData.has('tutorInstructions');
    const tutorInstructions = formData
      .get('tutorInstructions')
      ?.toString()
      .trim();
    const imageFile = formData.get('image') as File | null;
    const deleteImage = formData.get('deleteImage') === 'true';
    const hasRubricIdField = formData.has('rubricId');
    const rawRubricId = formData.get('rubricId')?.toString() ?? '';

    if (!assignmentTypeId) {
      throw new Response('Not Found', { status: 404 });
    }

    if (!title) {
      return dataResponse({ error: 'Title is required' }, { status: 400 });
    }

    const existing = await prisma.assignmentType.findUnique({
      where: { id: assignmentTypeId },
      select: {
        id: true,
        rubricJson: true,
        scoringScaleJson: true,
        gradingPromptConfigJson: true,
        gradingOutputSchemaJson: true,
        tutorInstructions: true,
        rubric: { select: { schemaJson: true } },
      },
    });
    if (!existing) {
      throw new Response('Not Found', { status: 404 });
    }

    let rubricSelection: Awaited<
      ReturnType<typeof resolveAdminRubricPickerSelection>
    > | null = null;
    if (hasRubricIdField) {
      try {
        rubricSelection = await resolveAdminRubricPickerSelection(rawRubricId);
      } catch (error) {
        if (error instanceof Response) {
          return dataResponse({ error: await error.text() }, { status: 400 });
        }
        throw error;
      }
    }

    const overrideChanged =
      formData.has('gradingInstructionsOverride') &&
      (formData.get('gradingInstructionsOverride')?.toString().trim() ?? '') !==
        readGradingInstructionsOverride(existing.gradingPromptConfigJson);
    // Legacy forms overlay the stored config only when the textarea changed.
    // An explicit config (including {}) also retains the form's versioning rules.
    const gradingConfig = parseAdminUpdateGradingConfig(formData, existing) ??
      (overrideChanged ? {
        gradingPromptConfigJson: withGradingInstructionsOverride(
          existing.gradingPromptConfigJson,
          formData.get('gradingInstructionsOverride')
        ),
        gradingAssistantVersion: { increment: 1 },
      } : {});
    const tutorInstructionsChanged =
      hasTutorInstructions &&
      (tutorInstructions || null) !== (existing.tutorInstructions?.trim() || null);
    const stampCrossUiProvenance =
      tutorInstructionsChanged ||
      overrideChanged ||
      Object.keys(gradingConfig).length > 0 ||
      rubricSelection?.kind === 'per-type';
    await prisma.$transaction(async (tx) => {
      if (deleteImage) {
        await removeAssignmentTypeImage(tx, assignmentTypeId);
      } else if (imageFile && imageFile.size > 0) {
        await replaceAssignmentTypeImage(tx, assignmentTypeId, {
          contentType: imageFile.type, blob: Buffer.from(await imageFile.arrayBuffer()),
        });
      }
      await updateAssignmentType(tx, assignmentTypeId, existing, {
        title, description: description || null,
        ...(rubricSelection ? { rubricSelection } : {}),
        ...(hasTutorInstructions ? { tutorInstructions: tutorInstructions || null } : {}),
        gradingConfig,
        ...(stampCrossUiProvenance
          ? {
              adminEditProvenance: {
                source: 'platform',
                updatedBy: actorEmail,
              },
            }
          : {}),
      });
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'createModule') {
    const title = formData.get('title')?.toString();
    const description = formData.get('description')?.toString();
    const isSelfGuided = formData.get('isSelfGuided') === 'on';
    const tutorInstructions = formData.get('tutorInstructions')?.toString();

    if (!title) {
      throw new Response('Title is required', { status: 400 });
    }

    await createModule(prisma, params.id!, {
      title,
      description: description || null,
      isSelfGuided,
      tutorInstructions: tutorInstructions || null,
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'reorderModules') {
    const moduleIds = JSON.parse(formData.get('moduleIds')?.toString() || '[]');

    await reorderModules(prisma, moduleIds);

    return dataResponse({ status: 'success' });
  }

  return dataResponse({ status: 'error' });
}

export default function AssignmentTypeRoute() {
  const {
    course,
    rubrics,
    currentPromptLabel,
    lastEditLine,
    scoringScale,
    rubric,
  } = useLoaderData<typeof loader>();

  return (
    <AssignmentTypeEditorForm
      mode="edit"
      assignmentTypeId={course.id}
      titleDefaultValue={course.title}
      descriptionDefaultValue={course.description}
      rubrics={rubrics}
      selectedRubricId={course.rubricId ?? null}
      gradingInstructionsDefaultValue={readGradingInstructionsOverride(course.gradingPromptConfigJson)}
      tutorInstructionsDefaultValue={course.tutorInstructions}
      archivedAt={course.archivedAt}
      imageId={course.image?.id ?? null}
      modules={course.assignmentModules}
      currentPromptLabel={currentPromptLabel}
      lastEditLine={lastEditLine}
      scoringScale={scoringScale}
      rubric={rubric}
    />
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
