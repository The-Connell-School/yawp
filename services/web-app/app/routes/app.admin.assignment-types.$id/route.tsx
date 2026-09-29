import { listRubrics, seedStarterRubrics } from '~/domain/rubrics/rubric-library.server';
import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { data as dataResponse, redirect, useLoaderData } from 'react-router';
import type { Prisma } from '@app/prisma';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { AssignmentTypeEditorForm } from '~/components/admin/assignment-type-editor-form';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  DEFAULT_OUTPUT_SCHEMA_JSON,
  parseRubric,
} from '~/domain/assignment-types/assignment-type-rubric.shared';
import { isRubricFullyPopulated } from '~/domain/assignment-types/assignment-type-rubric-config';
import { resolveAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import { compileGradingAssistantInvocation } from '~/domain/grading/grading-assistant-invocation';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { computePromptVersionLabels } from '~/domain/ai-evaluation/assignment-type-evaluation.shared';
import { isPromptVersionControlEnabled } from '~/domain/ai-evaluation/prompt-version-control.server';

const PROMPT_PREVIEW_INPUTS = {
  studentFirstName: 'Jordan',
  strictnessLevel: 'intermediate',
  documentText: '[CASE DOCUMENT CONTENT]',
} as const;

function parseJsonFormField(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    throw new Response(`${name} must be valid JSON`, { status: 400 });
  }
}

function withGradingInstructionsOverride(
  rawPromptConfig: unknown,
  rawOverride: FormDataEntryValue | null
) {
  const promptConfig =
    rawPromptConfig &&
    typeof rawPromptConfig === 'object' &&
    !Array.isArray(rawPromptConfig)
      ? { ...(rawPromptConfig as Record<string, unknown>) }
      : {};
  const gradingInstructionsOverride =
    typeof rawOverride === 'string' ? rawOverride.trim() : '';

  if (gradingInstructionsOverride) {
    promptConfig.gradingInstructionsOverride = gradingInstructionsOverride;
  } else {
    delete promptConfig.gradingInstructionsOverride;
  }

  return promptConfig as Prisma.InputJsonObject;
}

function readGradingInstructionsOverride(rawPromptConfig: unknown) {
  if (
    !rawPromptConfig ||
    typeof rawPromptConfig !== 'object' ||
    Array.isArray(rawPromptConfig)
  ) {
    return '';
  }

  const value = (rawPromptConfig as Record<string, unknown>)
    .gradingInstructionsOverride;
  return typeof value === 'string' ? value.trim() : '';
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

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

  await seedStarterRubrics();
  const rubrics = (await listRubrics()).map(({ id, name, title, json }) => ({ id, name, title, json }));
  const currentPromptLabel = await resolveCurrentPromptLabel(course.id);

  if (course.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY) {
    return dataResponse({
      course,
      rubrics,
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

  return dataResponse({
    course,
    rubrics,
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
  const formData = await request.formData();
  const intent = formData.get('intent');
  const assignmentTypeId = params.id;

  if (intent === 'deleteCourse') {
    await prisma.assignmentType.update({
      where: { id: params.id },
      data: { archivedAt: new Date() },
    });

    return redirect('/app/admin/assignments');
  }

  if (intent === 'unarchiveCourse') {
    await prisma.assignmentType.update({
      where: { id: params.id },
      data: { archivedAt: null },
    });

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
    const hasGradingConfigFields =
      formData.has('scoringScale') ||
      formData.has('rubricJson') ||
      formData.has('promptConfigJson') ||
      formData.has('outputSchemaJson');
    const hasGradingInstructionsOverrideField = formData.has(
      'gradingInstructionsOverride'
    );
    const hasRubricIdField = formData.has('rubricId');
    const rawRubricId = formData.get('rubricId')?.toString() ?? '';
    const rubricId =
      rawRubricId && rawRubricId !== '__none__' ? rawRubricId : null;

    if (!assignmentTypeId) {
      throw new Response('Not Found', { status: 404 });
    }

    if (!title) {
      return dataResponse({ error: 'Title is required' }, { status: 400 });
    }

    const existing = await prisma.assignmentType.findUnique({
      where: { id: assignmentTypeId },
      select: { id: true, rubricJson: true, gradingPromptConfigJson: true },
    });
    if (!existing) {
      throw new Response('Not Found', { status: 404 });
    }

    if (hasRubricIdField && rubricId) {
      const rubric = await prisma.rubric.findUnique({
        where: { id: rubricId },
        select: { id: true },
      });
      if (!rubric) {
        return dataResponse({ error: 'That rubric no longer exists. Choose another rubric.' }, { status: 400 });
      }
    }

    const gradingInstructionsOverrideChanged =
      hasGradingInstructionsOverrideField &&
      (formData.get('gradingInstructionsOverride')?.toString().trim() ?? '') !==
        readGradingInstructionsOverride(existing.gradingPromptConfigJson);

    const gradingConfigData = hasGradingConfigFields
      ? {
          scoringScaleJson: parseJsonFormField(formData, 'scoringScale'),
          rubricJson: parseJsonFormField(formData, 'rubricJson'),
          gradingPromptConfigJson: hasGradingInstructionsOverrideField
            ? withGradingInstructionsOverride(
                parseJsonFormField(formData, 'promptConfigJson'),
                formData.get('gradingInstructionsOverride')
              )
            : parseJsonFormField(formData, 'promptConfigJson'),
          gradingOutputSchemaJson:
            parseJsonFormField(formData, 'outputSchemaJson') ??
            DEFAULT_OUTPUT_SCHEMA_JSON,
          gradingAssistantVersion: { increment: 1 },
        }
      : gradingInstructionsOverrideChanged
        ? {
            gradingPromptConfigJson: withGradingInstructionsOverride(
              existing.gradingPromptConfigJson,
              formData.get('gradingInstructionsOverride')
            ),
            gradingAssistantVersion: { increment: 1 },
          }
        : {};

    if (hasGradingConfigFields) {
      const nextRubric = parseRubric(gradingConfigData.rubricJson);
      const nextRubricComplete = isRubricFullyPopulated(nextRubric);
      if (!nextRubricComplete) {
        // Grandfather assignment types whose rubric was already incomplete
        // before this edit — don't force an unrelated save (e.g. a title
        // change) to be blocked on fixing a pre-existing gap. Only block edits
        // that would newly break a rubric that was whole.
        const previouslyComplete = isRubricFullyPopulated(
          parseRubric((existing as { rubricJson?: unknown }).rubricJson)
        );
        if (previouslyComplete) {
          throw new Response(
            'Every rubric category needs a key, label, description, and weight before saving. Finish the categories you started, or remove them.',
            { status: 400 }
          );
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      if (deleteImage) {
        await tx.assignmentTypeImage.deleteMany({
          where: { assignmentTypeId },
        });
      } else if (imageFile && imageFile.size > 0) {
        const arrayBuffer = await imageFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await tx.assignmentTypeImage.deleteMany({
          where: { assignmentTypeId },
        });
        await tx.assignmentTypeImage.create({
          data: {
            contentType: imageFile.type,
            blob: buffer,
            assignmentTypeId,
          },
        });
      }

      await tx.assignmentType.update({
        where: { id: assignmentTypeId },
        data: {
          title,
          description: description || null,
          ...(hasRubricIdField ? { rubricId } : {}),
          ...(hasTutorInstructions
            ? { tutorInstructions: tutorInstructions || null }
            : {}),
          ...gradingConfigData,
        },
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

    const moduleCount = await prisma.assignmentModule.count({
      where: { assignmentTypeId: params.id, deletedAt: null },
    });

    await prisma.assignmentModule.create({
      data: {
        title,
        description: description || null,
        isSelfGuided,
        tutorInstructions: tutorInstructions || null,
        position: moduleCount,
        assignmentTypeId: params.id!,
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'reorderModules') {
    const moduleIds = JSON.parse(formData.get('moduleIds')?.toString() || '[]');

    await Promise.all(
      moduleIds.map((moduleId: string, index: number) =>
        prisma.assignmentModule.update({
          where: { id: moduleId },
          data: { position: index },
        })
      )
    );

    return dataResponse({ status: 'success' });
  }

  return dataResponse({ status: 'error' });
}

export default function AssignmentTypeRoute() {
  const {
    course,
    rubrics,
    currentPromptLabel,
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
    />
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
