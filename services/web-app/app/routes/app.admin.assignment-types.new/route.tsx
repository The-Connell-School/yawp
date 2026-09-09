import { listRubrics, seedStarterRubrics } from '~/domain/rubrics/rubric-library.server';
import {
  data as dataResponse,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { AssignmentTypeEditorForm } from '~/components/admin/assignment-type-editor-form';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  DEFAULT_OUTPUT_SCHEMA_JSON,
  parseRubric,
} from '~/domain/assignment-types/assignment-type-rubric.shared';
import { isRubricFullyPopulated } from '~/domain/assignment-types/assignment-type-rubric-config';

function parseJsonFormField(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    throw new Response(`${name} must be valid JSON`, { status: 400 });
  }
}

function parseGradingConfig(formData: FormData) {
  const hasGradingConfigFields =
    formData.has('scoringScale') ||
    formData.has('rubricJson') ||
    formData.has('promptConfigJson') ||
    formData.has('outputSchemaJson');
  const rubricJson = hasGradingConfigFields
    ? parseJsonFormField(formData, 'rubricJson')
    : null;
  if (
    hasGradingConfigFields &&
    !isRubricFullyPopulated(parseRubric(rubricJson))
  ) {
    throw new Response(
      'Every rubric category needs a key, label, description, and weight before you can create this assignment type. Add at least one, and finish the ones you started.',
      { status: 400 }
    );
  }

  return hasGradingConfigFields
    ? {
        scoringScaleJson: parseJsonFormField(formData, 'scoringScale'),
        rubricJson,
        gradingPromptConfigJson: parseJsonFormField(
          formData,
          'promptConfigJson'
        ),
        gradingOutputSchemaJson:
          parseJsonFormField(formData, 'outputSchemaJson') ??
          DEFAULT_OUTPUT_SCHEMA_JSON,
      }
    : {};
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  await seedStarterRubrics();
  const rubrics = (await listRubrics()).map(({ id, name, title, json }) => ({ id, name, title, json }));
  return dataResponse({ rubrics });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const title = formData.get('title')?.toString().trim();
  const description = formData.get('description')?.toString().trim() || null;

  if (!title) {
    return dataResponse({ error: 'Title is required' }, { status: 400 });
  }

  const rawRubricId = formData.get('rubricId')?.toString().trim();
  const rubricId = rawRubricId && rawRubricId !== '__none__' ? rawRubricId : null;
  if (rubricId) {
    const rubric = await prisma.rubric.findUnique({ where: { id: rubricId }, select: { id: true } });
    if (!rubric) return dataResponse({ error: 'That rubric no longer exists. Choose another rubric.' }, { status: 400 });
  }

  let gradingConfigData: ReturnType<typeof parseGradingConfig>;
  try {
    gradingConfigData = parseGradingConfig(formData);
  } catch (error) {
    if (error instanceof Response && error.status === 400) {
      return dataResponse({ error: await error.text() }, { status: 400 });
    }
    throw error;
  }

  const override = formData.get('gradingInstructionsOverride')?.toString().trim();
  if (override) {
    gradingConfigData = { ...gradingConfigData, gradingPromptConfigJson: {
      ...(gradingConfigData.gradingPromptConfigJson ?? {}), gradingInstructionsOverride: override,
    } };
  }
  const count = await prisma.assignmentType.count();
  const assignmentType = await prisma.assignmentType.create({
    data: {
      title,
      kind: null,
      description,
      position: count,
      ...(formData.has('rubricId') ? { rubricId } : {}),
      ...gradingConfigData,
    },
  });

  return redirect(`/app/admin/assignment-types/${assignmentType.id}`);
}

export default function NewAssignmentTypeRoute() {
  const { rubrics } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return <AssignmentTypeEditorForm mode="create" rubrics={rubrics} error={actionData?.error} />;
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
