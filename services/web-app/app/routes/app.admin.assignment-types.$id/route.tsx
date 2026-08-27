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
import {
  listRubrics,
  seedStarterRubrics,
} from '~/domain/rubrics/rubric-library.server';

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

  // The built-in rubrics are put in the library on first sight, so every
  // environment offers the same starting set without a deploy step.
  await seedStarterRubrics();
  const rubrics = await listRubrics();

  return dataResponse({
    course,
    rubrics: rubrics.map((rubric) => ({
      id: rubric.id,
      name: rubric.name,
      title: rubric.title,
      json: rubric.json,
    })),
  });
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
    const title = formData.get('title')?.toString();
    const description = formData.get('description')?.toString();
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
      throw new Response('Title is required', { status: 400 });
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
        throw new Response('That rubric no longer exists.', { status: 404 });
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
  const { course, rubrics } = useLoaderData<typeof loader>();
  const gradingPromptConfig = course.gradingPromptConfigJson;
  const gradingInstructionsDefaultValue =
    gradingPromptConfig &&
    typeof gradingPromptConfig === 'object' &&
    !Array.isArray(gradingPromptConfig) &&
    typeof (gradingPromptConfig as Record<string, unknown>)
      .gradingInstructionsOverride === 'string'
      ? ((gradingPromptConfig as Record<string, unknown>)
          .gradingInstructionsOverride as string)
      : '';

  return (
    <AssignmentTypeEditorForm
      mode="edit"
      assignmentTypeId={course.id}
      titleDefaultValue={course.title}
      descriptionDefaultValue={course.description}
      gradingInstructionsDefaultValue={gradingInstructionsDefaultValue}
      archivedAt={course.archivedAt}
      imageId={course.image?.id ?? null}
      modules={course.assignmentModules}
      rubrics={rubrics}
      selectedRubricId={course.rubricId ?? null}
    />
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
