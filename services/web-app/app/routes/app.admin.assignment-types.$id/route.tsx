import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { data as dataResponse, redirect, useLoaderData } from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { AssignmentTypeEditorForm } from '~/components/admin/assignment-type-editor-form';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  DEFAULT_OUTPUT_SCHEMA_JSON,
  parsePromptConfig,
  parseRubric,
  parseScoringScale,
} from '~/domain/assignment-types/assignment-type-rubric.shared';
import { resolveAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import { compileGradingAssistantInvocation } from '~/domain/grading/grading-assistant-invocation';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';

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

  if (course.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY) {
    return dataResponse({
      course,
      gradingAssistantPromptPreview: null,
      gradingAssistantPromptPreviewUnavailableReason:
        'The AP History prompt is built from the assignment snapshot. Open a graded submission to inspect the full prompt.',
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
    gradingAssistantPromptPreview: {
      ...compiledInvocation,
      version: resolvedGradingConfig.version,
      source: resolvedGradingConfig.source,
      previewInputs: PROMPT_PREVIEW_INPUTS,
    },
    gradingAssistantPromptPreviewUnavailableReason: null,
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

    if (!assignmentTypeId) {
      throw new Response('Not Found', { status: 404 });
    }

    if (!title) {
      throw new Response('Title is required', { status: 400 });
    }

    const existing = await prisma.assignmentType.findUnique({
      where: { id: assignmentTypeId },
      select: { id: true },
    });
    if (!existing) {
      throw new Response('Not Found', { status: 404 });
    }

    const gradingConfigData = hasGradingConfigFields
      ? {
          scoringScaleJson: parseJsonFormField(formData, 'scoringScale'),
          rubricJson: parseJsonFormField(formData, 'rubricJson'),
          gradingPromptConfigJson: parseJsonFormField(
            formData,
            'promptConfigJson'
          ),
          gradingOutputSchemaJson:
            parseJsonFormField(formData, 'outputSchemaJson') ??
            DEFAULT_OUTPUT_SCHEMA_JSON,
          gradingAssistantVersion: { increment: 1 },
        }
      : {};

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
    gradingAssistantPromptPreview,
    gradingAssistantPromptPreviewUnavailableReason,
  } = useLoaderData<typeof loader>();

  return (
    <AssignmentTypeEditorForm
      mode="edit"
      assignmentTypeId={course.id}
      titleDefaultValue={course.title}
      descriptionDefaultValue={course.description}
      scoringScale={parseScoringScale(course.scoringScaleJson)}
      rubric={parseRubric(course.rubricJson)}
      promptConfig={parsePromptConfig(course.gradingPromptConfigJson)}
      gradingAssistantPromptPreview={gradingAssistantPromptPreview ?? undefined}
      gradingAssistantPromptPreviewUnavailableReason={
        gradingAssistantPromptPreviewUnavailableReason ?? undefined
      }
      archivedAt={course.archivedAt}
      imageId={course.image?.id ?? null}
      modules={course.assignmentModules}
    />
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
